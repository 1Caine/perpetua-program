use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::Token;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_2022::spl_token_2022::extension::StateWithExtensions;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, CloseAccount, Mint, Revoke, TokenAccount};

use crate::constants::*;
use crate::errors::PerpetuaError;
use crate::events::*;
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
#[instruction(id: u32, interval_secs: i64, heirs: Vec<HeirInput>)]
pub struct CreateSwitch<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = owner,
        space = OwnerProfile::SPACE,
        seeds = [OWNER_SEED, owner.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, OwnerProfile>,
    #[account(
        init,
        payer = owner,
        space = Switch::space(heirs.len(), 0),
        seeds = [SWITCH_SEED, owner.key().as_ref(), &id.to_le_bytes()],
        bump
    )]
    pub switch: Account<'info, Switch>,
    #[account(mut, seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: SystemAccount<'info>,
    pub tier_holding: Option<InterfaceAccount<'info, TokenAccount>>,
    pub tier_mint: Option<InterfaceAccount<'info, Mint>>,
    pub system_program: Program<'info, System>,
}

pub fn create_switch(ctx: Context<CreateSwitch>, id: u32, interval_secs: i64, heirs: Vec<HeirInput>) -> Result<()> {
    let a = ctx.accounts;
    require!(!a.config.paused, PerpetuaError::ProtocolPaused);
    let owner = a.owner.key();
    let at = now()?;

    let profile = &mut a.profile;
    if profile.owner == Pubkey::default() {
        profile.owner = owner;
        profile.bump = ctx.bumps.profile;
    }
    require!(id == profile.next_id, PerpetuaError::BadSwitchId);

    let tier = resolve_tier(&a.config, &owner, &a.tier_holding, &a.tier_mint)?;
    require!(profile.active_switches < max_switches(tier), PerpetuaError::SwitchLimit);
    validate_interval(tier, interval_secs)?;
    let switch_key = a.switch.key();
    validate_heirs(&owner, &switch_key, &heirs, tier)?;

    let fee = if tier == TIER_FREE { SETUP_FEE_LAMPORTS } else { 0 };
    if fee > 0 {
        system_program::transfer(
            CpiContext::new(
                a.system_program.to_account_info(),
                system_program::Transfer {
                    from: a.owner.to_account_info(),
                    to: a.treasury.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    let s = &mut a.switch;
    s.owner = owner;
    s.id = id;
    s.bump = ctx.bumps.switch;
    s.status = STATUS_ACTIVE;
    s.tier = tier;
    s.reserve_bump = 0;
    s.interval_secs = interval_secs;
    s.grace_secs = GRACE_DAYS * DAY_SECONDS;
    s.created_at = at;
    s.last_check_in = at;
    s.triggered_at = 0;
    s.executed_at = 0;
    s.check_ins = 0;
    s.heirs = heirs
        .iter()
        .map(|h| Heir {
            wallet: h.wallet,
            bps: h.bps,
            letter: [0u8; 32],
        })
        .collect();
    s.assets = Vec::new();

    profile.next_id = profile.next_id.checked_add(1).ok_or(PerpetuaError::Overflow)?;
    profile.active_switches += 1;
    a.config.switches_created += 1;
    a.config.switches_active += 1;

    emit!(SwitchCreated {
        switch: switch_key,
        owner,
        id,
        tier,
        interval_secs,
        heirs: heirs.len() as u8,
        fee_lamports: fee,
        at,
    });
    Ok(())
}

/// Accounts shared by owner edits that re-check the tier.
#[derive(Accounts)]
pub struct OwnerEdit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [SWITCH_SEED, owner.key().as_ref(), &switch.id.to_le_bytes()],
        bump = switch.bump,
        has_one = owner
    )]
    pub switch: Account<'info, Switch>,
    pub tier_holding: Option<InterfaceAccount<'info, TokenAccount>>,
    pub tier_mint: Option<InterfaceAccount<'info, Mint>>,
    pub system_program: Program<'info, System>,
}

impl<'info> OwnerEdit<'info> {
    fn tier(&self) -> Result<u8> {
        resolve_tier(&self.config, &self.owner.key(), &self.tier_holding, &self.tier_mint)
    }
    fn fit(&self) -> Result<()> {
        fit_switch(
            &self.switch.to_account_info(),
            &self.switch,
            &self.owner.to_account_info(),
            &self.system_program.to_account_info(),
        )
    }
}

pub fn update_heirs(ctx: Context<OwnerEdit>, heirs: Vec<HeirInput>) -> Result<()> {
    let tier = ctx.accounts.tier()?;
    let owner = ctx.accounts.owner.key();
    let switch_key = ctx.accounts.switch.key();
    let at = now()?;
    {
        let s = &mut ctx.accounts.switch;
        require!(s.editable(), PerpetuaError::NotEditable);
        validate_heirs(&owner, &switch_key, &heirs, tier)?;
        // A letter stays attached to an heir who remains on the list.
        let old = s.heirs.clone();
        s.heirs = heirs
            .iter()
            .map(|h| Heir {
                wallet: h.wallet,
                bps: h.bps,
                letter: old.iter().find(|o| o.wallet == h.wallet).map(|o| o.letter).unwrap_or([0u8; 32]),
            })
            .collect();
        validate_switch_for_tier(s, tier)?;
        s.tier = tier;
        touch(s, at);
    }
    ctx.accounts.fit()?;
    emit!(HeirsUpdated {
        switch: switch_key,
        heirs: heirs.len() as u8,
        at,
    });
    Ok(())
}

pub fn update_interval(ctx: Context<OwnerEdit>, interval_secs: i64) -> Result<()> {
    let tier = ctx.accounts.tier()?;
    let switch_key = ctx.accounts.switch.key();
    let at = now()?;
    let s = &mut ctx.accounts.switch;
    require!(s.editable(), PerpetuaError::NotEditable);
    s.interval_secs = interval_secs;
    validate_switch_for_tier(s, tier)?;
    s.tier = tier;
    touch(s, at);
    emit!(IntervalUpdated {
        switch: switch_key,
        interval_secs,
        at,
    });
    Ok(())
}

pub fn set_letters(ctx: Context<OwnerEdit>, letters: Vec<[u8; 32]>) -> Result<()> {
    let tier = ctx.accounts.tier()?;
    let switch_key = ctx.accounts.switch.key();
    let at = now()?;
    let s = &mut ctx.accounts.switch;
    require!(s.editable(), PerpetuaError::NotEditable);
    require!(letters.len() == s.heirs.len(), PerpetuaError::LetterCountMismatch);
    let count = letters.iter().filter(|l| **l != [0u8; 32]).count();
    if count > 0 {
        require!(tier >= TIER_HOLDER, PerpetuaError::LettersNeedHolder);
    }
    validate_switch_for_tier(s, tier)?;
    for (h, l) in s.heirs.iter_mut().zip(letters.iter()) {
        h.letter = *l;
    }
    s.tier = tier;
    touch(s, at);
    emit!(LettersUpdated {
        switch: switch_key,
        letters: count as u8,
        at,
    });
    Ok(())
}

pub fn set_asset_recipient(ctx: Context<OwnerEdit>, index: u8, recipient: u8) -> Result<()> {
    let tier = ctx.accounts.tier()?;
    let switch_key = ctx.accounts.switch.key();
    let at = now()?;
    let s = &mut ctx.accounts.switch;
    require!(s.editable(), PerpetuaError::NotEditable);
    let i = index as usize;
    require!(i < s.assets.len(), PerpetuaError::BadAssetIndex);
    s.assets[i].recipient = recipient;
    validate_switch_for_tier(s, tier)?;
    s.tier = tier;
    touch(s, at);
    let a = s.assets[i];
    emit!(AssetUpdated {
        switch: switch_key,
        index,
        mint: a.mint,
        amount: a.approved,
        recipient,
        at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [SWITCH_SEED, owner.key().as_ref(), &switch.id.to_le_bytes()],
        bump = switch.bump,
        has_one = owner
    )]
    pub switch: Account<'info, Switch>,
}

/// "I'm here." Resets the timer. Allowed until execution starts, even after the deadline.
pub fn check_in(ctx: Context<OwnerOnly>) -> Result<()> {
    let switch_key = ctx.accounts.switch.key();
    let at = now()?;
    let s = &mut ctx.accounts.switch;
    require!(s.status == STATUS_ACTIVE, PerpetuaError::NotActive);
    s.last_check_in = at;
    s.check_ins = s.check_ins.saturating_add(1);
    emit!(CheckedIn {
        switch: switch_key,
        owner: s.owner,
        check_ins: s.check_ins,
        deadline: s.deadline(),
        at,
    });
    Ok(())
}

/// A paused switch never fires. Resuming starts a fresh interval.
pub fn pause(ctx: Context<OwnerOnly>) -> Result<()> {
    let switch_key = ctx.accounts.switch.key();
    let s = &mut ctx.accounts.switch;
    require!(s.status == STATUS_ACTIVE, PerpetuaError::NotActive);
    s.status = STATUS_PAUSED;
    emit!(SwitchPaused {
        switch: switch_key,
        at: now()?,
    });
    Ok(())
}

pub fn resume(ctx: Context<OwnerOnly>) -> Result<()> {
    let switch_key = ctx.accounts.switch.key();
    let at = now()?;
    let s = &mut ctx.accounts.switch;
    require!(s.status == STATUS_PAUSED, PerpetuaError::NotPaused);
    s.status = STATUS_ACTIVE;
    s.last_check_in = at;
    emit!(SwitchResumed {
        switch: switch_key,
        deadline: s.deadline(),
        at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [OWNER_SEED, owner.key().as_ref()], bump = profile.bump)]
    pub profile: Account<'info, OwnerProfile>,
    #[account(
        mut,
        close = owner,
        seeds = [SWITCH_SEED, owner.key().as_ref(), &switch.id.to_le_bytes()],
        bump = switch.bump,
        has_one = owner
    )]
    pub switch: Account<'info, Switch>,
    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    // remaining_accounts: the token account of every asset, in asset order.
}

/// Revokes every delegation this switch holds, unwraps the SOL reserve back to the
/// owner and closes the switch (rent back to the owner).
pub fn cancel<'info>(ctx: Context<'_, '_, 'info, 'info, Cancel<'info>>) -> Result<()> {
    let s = &ctx.accounts.switch;
    require!(s.editable(), PerpetuaError::NotEditable);
    require!(
        ctx.remaining_accounts.len() == s.assets.len(),
        PerpetuaError::RemainingAccountsMismatch
    );
    let switch_key = s.key();
    let owner_ai = ctx.accounts.owner.to_account_info();
    let mut revoked: u8 = 0;
    for (asset, acc) in s.assets.iter().zip(ctx.remaining_accounts.iter()) {
        require_keys_eq!(acc.key(), asset.token_account, PerpetuaError::RemainingAccountsMismatch);
        revoked += release_asset(
            asset,
            acc,
            &switch_key,
            &owner_ai,
            &ctx.accounts.token_program.to_account_info(),
            &ctx.accounts.token_2022_program.to_account_info(),
        )?;
    }
    ctx.accounts.profile.active_switches = ctx.accounts.profile.active_switches.saturating_sub(1);
    ctx.accounts.config.switches_active = ctx.accounts.config.switches_active.saturating_sub(1);
    emit!(SwitchCancelled {
        switch: switch_key,
        owner: ctx.accounts.owner.key(),
        revoked,
        at: now()?,
    });
    Ok(())
}

/// Revokes this switch's delegation on an asset account (only if the switch is still the
/// delegate, so a delegation the owner gave elsewhere is never touched) and closes the
/// SOL reserve back into the owner's wallet. Returns 1 if a delegation was revoked.
pub fn release_asset<'info>(
    asset: &Asset,
    acc: &AccountInfo<'info>,
    switch_key: &Pubkey,
    owner_ai: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    token_2022_program: &AccountInfo<'info>,
) -> Result<u8> {
    let program = if asset.token_2022 { token_2022_program } else { token_program };
    if acc.data_is_empty() || acc.owner != program.key {
        return Ok(0);
    }
    let (delegate, authority) = {
        let data = acc.try_borrow_data()?;
        let st = StateWithExtensions::<spl_token_2022::state::Account>::unpack(&data)?;
        (Option::<Pubkey>::from(st.base.delegate), st.base.owner)
    };
    if authority != owner_ai.key() {
        return Ok(0);
    }
    let mut revoked = 0;
    if delegate == Some(*switch_key) {
        token_interface::revoke(CpiContext::new(
            program.clone(),
            Revoke {
                source: acc.clone(),
                authority: owner_ai.clone(),
            },
        ))?;
        revoked = 1;
    }
    if asset.kind == KIND_SOL {
        token_interface::close_account(CpiContext::new(
            program.clone(),
            CloseAccount {
                account: acc.clone(),
                destination: owner_ai.clone(),
                authority: owner_ai.clone(),
            },
        ))?;
    }
    Ok(revoked)
}
