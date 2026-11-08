use anchor_lang::prelude::*;
use anchor_spl::associated_token::{self, get_associated_token_address_with_program_id, AssociatedToken, Create};
use anchor_spl::token::spl_token::native_mint;
use anchor_spl::token_interface::{self, CloseAccount, Mint, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::errors::PerpetuaError;
use crate::events::*;
use crate::state::*;
use crate::utils::*;

// Execution is permissionless. Our keeper runs it on a schedule, but anyone can.
// Order: trigger -> settle_asset (each asset) -> deliver_* (each heir) -> EXECUTED.

#[derive(Accounts)]
pub struct Trigger<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [OWNER_SEED, switch.owner.as_ref()], bump = profile.bump)]
    pub profile: Account<'info, OwnerProfile>,
    #[account(mut, seeds = [SWITCH_SEED, switch.owner.as_ref(), &switch.id.to_le_bytes()], bump = switch.bump)]
    pub switch: Account<'info, Switch>,
}

/// Starts execution once the interval and the grace period have both passed without a check-in.
pub fn trigger(ctx: Context<Trigger>) -> Result<()> {
    let at = now()?;
    let switch_key = ctx.accounts.switch.key();
    let s = &mut ctx.accounts.switch;
    require!(s.status == STATUS_ACTIVE, PerpetuaError::NotActive);
    require!(at >= s.executable_at(), PerpetuaError::TooEarly);
    s.status = STATUS_TRIGGERED;
    s.triggered_at = at;
    emit!(SwitchTriggered {
        switch: switch_key,
        owner: s.owner,
        caller: ctx.accounts.caller.key(),
        assets: s.assets.len() as u8,
        at,
    });
    maybe_finalize(s, switch_key, at);
    ctx.accounts.profile.active_switches = ctx.accounts.profile.active_switches.saturating_sub(1);
    ctx.accounts.config.switches_active = ctx.accounts.config.switches_active.saturating_sub(1);
    ctx.accounts.config.executions += 1;
    Ok(())
}

#[derive(Accounts)]
pub struct SettleAsset<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [SWITCH_SEED, switch.owner.as_ref(), &switch.id.to_le_bytes()], bump = switch.bump)]
    pub switch: Account<'info, Switch>,
    /// CHECK: the owner's token account; checked against the switch and parsed by hand
    /// because it may have been closed, re-delegated or frozen.
    #[account(mut)]
    pub source: UncheckedAccount<'info>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: the switch's associated token account for `mint`; created here if missing.
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,
    #[account(mut, seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: SystemAccount<'info>,
    /// CHECK: the treasury's associated token account for `mint` (unused for SOL).
    #[account(mut)]
    pub treasury_token: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Pulls the delegated amount of one asset into the switch's escrow and takes the 0.5% fee.
/// SOL is unwrapped so heirs receive native SOL.
pub fn settle_asset(ctx: Context<SettleAsset>, index: u8) -> Result<()> {
    let at = now()?;
    let a = &ctx.accounts;
    let switch_key = a.switch.key();
    require!(a.switch.status == STATUS_TRIGGERED, PerpetuaError::NotTriggered);
    let i = index as usize;
    require!(i < a.switch.assets.len(), PerpetuaError::BadAssetIndex);
    let asset = a.switch.assets[i];
    require!(asset.state == ASSET_PENDING, PerpetuaError::BadAssetState);
    require_keys_eq!(a.source.key(), asset.token_account, PerpetuaError::AccountMismatch);
    require_keys_eq!(a.mint.key(), asset.mint, PerpetuaError::AccountMismatch);
    let tp = token_program_for(&asset);
    require_keys_eq!(a.token_program.key(), tp, PerpetuaError::WrongTokenProgram);
    require_keys_eq!(
        a.escrow.key(),
        get_associated_token_address_with_program_id(&switch_key, &asset.mint, &tp),
        PerpetuaError::AccountMismatch
    );

    let (available, reason) = available_from_source(&a.source.to_account_info(), &asset, &switch_key, &a.switch.owner);
    if available == 0 {
        let s = &mut ctx.accounts.switch;
        s.assets[i].state = ASSET_SKIPPED;
        emit!(AssetSkipped {
            switch: switch_key,
            index,
            mint: asset.mint,
            reason,
            at,
        });
        maybe_finalize(s, switch_key, at);
        return Ok(());
    }

    let owner = a.switch.owner;
    let id_bytes = a.switch.id.to_le_bytes();
    let bump = [a.switch.bump];
    let seeds: &[&[u8]] = &[SWITCH_SEED, owner.as_ref(), &id_bytes, &bump];
    let signer = &[seeds];

    associated_token::create_idempotent(CpiContext::new(
        a.associated_token_program.to_account_info(),
        Create {
            payer: a.payer.to_account_info(),
            associated_token: a.escrow.to_account_info(),
            authority: a.switch.to_account_info(),
            mint: a.mint.to_account_info(),
            system_program: a.system_program.to_account_info(),
            token_program: a.token_program.to_account_info(),
        },
    ))?;
    let before = token_balance(&a.escrow.to_account_info())?;
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            a.token_program.to_account_info(),
            TransferChecked {
                from: a.source.to_account_info(),
                mint: a.mint.to_account_info(),
                to: a.escrow.to_account_info(),
                authority: a.switch.to_account_info(),
            },
            signer,
        ),
        available,
        a.mint.decimals,
    )?;
    let after = token_balance(&a.escrow.to_account_info())?;
    // Measured, not assumed: Token-2022 transfer fees arrive short.
    let received = after.checked_sub(before).ok_or(PerpetuaError::Overflow)?;
    let fee = ((received as u128) * (EXECUTION_FEE_BPS as u128) / (BPS_DENOMINATOR as u128)) as u64;

    if asset.kind == KIND_SOL {
        // Unwrap: closing the escrow sends its lamports (wrapped SOL + rent) to the switch.
        let escrow_lamports = a.escrow.lamports();
        let rent_part = escrow_lamports.checked_sub(after).ok_or(PerpetuaError::Overflow)?;
        token_interface::close_account(CpiContext::new_with_signer(
            a.token_program.to_account_info(),
            CloseAccount {
                account: a.escrow.to_account_info(),
                destination: a.switch.to_account_info(),
                authority: a.switch.to_account_info(),
            },
            signer,
        ))?;
        let switch_ai = a.switch.to_account_info();
        // The payer opened the escrow; give its rent back. Anything someone donated to the
        // escrow before settlement stays in the switch account, untouched.
        move_lamports(&switch_ai, &a.payer.to_account_info(), rent_part)?;
        move_lamports(&switch_ai, &a.treasury.to_account_info(), fee)?;
    } else if fee > 0 {
        require_keys_eq!(
            a.treasury_token.key(),
            get_associated_token_address_with_program_id(&a.treasury.key(), &asset.mint, &tp),
            PerpetuaError::AccountMismatch
        );
        associated_token::create_idempotent(CpiContext::new(
            a.associated_token_program.to_account_info(),
            Create {
                payer: a.payer.to_account_info(),
                associated_token: a.treasury_token.to_account_info(),
                authority: a.treasury.to_account_info(),
                mint: a.mint.to_account_info(),
                system_program: a.system_program.to_account_info(),
                token_program: a.token_program.to_account_info(),
            },
        ))?;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                a.token_program.to_account_info(),
                TransferChecked {
                    from: a.escrow.to_account_info(),
                    mint: a.mint.to_account_info(),
                    to: a.treasury_token.to_account_info(),
                    authority: a.switch.to_account_info(),
                },
                signer,
            ),
            fee,
            a.mint.decimals,
        )?;
    }

    let heirs = ctx.accounts.switch.heirs.len();
    let s = &mut ctx.accounts.switch;
    let asset_mut = &mut s.assets[i];
    asset_mut.escrowed = received - fee;
    asset_mut.fee = fee;
    asset_mut.state = ASSET_SETTLED;
    if asset_mut.recipient != SPLIT {
        // Single-recipient asset: every other heir counts as done.
        asset_mut.delivered = all_heirs_mask(heirs) & !(1u64 << asset_mut.recipient);
    }
    emit!(AssetSettled {
        switch: switch_key,
        index,
        kind: asset.kind,
        mint: asset.mint,
        amount: received,
        fee,
        at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct DeliverToken<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [SWITCH_SEED, switch.owner.as_ref(), &switch.id.to_le_bytes()], bump = switch.bump)]
    pub switch: Account<'info, Switch>,
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: the switch's associated token account for `mint`.
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,
    /// CHECK: must equal the heir's wallet stored in the switch.
    pub heir: UncheckedAccount<'info>,
    /// CHECK: the heir's associated token account; created here if missing.
    #[account(mut)]
    pub heir_token: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// Sends one heir their share of a settled token or NFT, creating their token account if needed.
pub fn deliver_token(ctx: Context<DeliverToken>, index: u8, heir_index: u8) -> Result<()> {
    let at = now()?;
    let a = &ctx.accounts;
    let switch_key = a.switch.key();
    require!(a.switch.status == STATUS_TRIGGERED, PerpetuaError::NotTriggered);
    let i = index as usize;
    let h = heir_index as usize;
    require!(i < a.switch.assets.len(), PerpetuaError::BadAssetIndex);
    require!(h < a.switch.heirs.len(), PerpetuaError::BadHeirIndex);
    let asset = a.switch.assets[i];
    require!(asset.state == ASSET_SETTLED, PerpetuaError::BadAssetState);
    require!(asset.kind != KIND_SOL, PerpetuaError::BadAssetState);
    require!(asset.delivered & (1u64 << h) == 0, PerpetuaError::AlreadyDelivered);
    let heir = a.switch.heirs[h];
    require_keys_eq!(a.heir.key(), heir.wallet, PerpetuaError::AccountMismatch);
    require_keys_eq!(a.mint.key(), asset.mint, PerpetuaError::AccountMismatch);
    let tp = token_program_for(&asset);
    require_keys_eq!(a.token_program.key(), tp, PerpetuaError::WrongTokenProgram);
    require_keys_eq!(
        a.escrow.key(),
        get_associated_token_address_with_program_id(&switch_key, &asset.mint, &tp),
        PerpetuaError::AccountMismatch
    );
    require_keys_eq!(
        a.heir_token.key(),
        get_associated_token_address_with_program_id(&heir.wallet, &asset.mint, &tp),
        PerpetuaError::AccountMismatch
    );
    let share = share_of(&asset, &a.switch.heirs, h)?;

    let owner = a.switch.owner;
    let id_bytes = a.switch.id.to_le_bytes();
    let bump = [a.switch.bump];
    let seeds: &[&[u8]] = &[SWITCH_SEED, owner.as_ref(), &id_bytes, &bump];
    let signer = &[seeds];

    if share > 0 {
        associated_token::create_idempotent(CpiContext::new(
            a.associated_token_program.to_account_info(),
            Create {
                payer: a.payer.to_account_info(),
                associated_token: a.heir_token.to_account_info(),
                authority: a.heir.to_account_info(),
                mint: a.mint.to_account_info(),
                system_program: a.system_program.to_account_info(),
                token_program: a.token_program.to_account_info(),
            },
        ))?;
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                a.token_program.to_account_info(),
                TransferChecked {
                    from: a.escrow.to_account_info(),
                    mint: a.mint.to_account_info(),
                    to: a.heir_token.to_account_info(),
                    authority: a.switch.to_account_info(),
                },
                signer,
            ),
            share,
            a.mint.decimals,
        )?;
    }

    let heirs = a.switch.heirs.len();
    let done = (asset.delivered | (1u64 << h)) == all_heirs_mask(heirs);
    if done
        && token_balance(&a.escrow.to_account_info())? == 0
        && !mint_has_transfer_fee(&a.mint.to_account_info())?
    {
        // Escrow is empty: close it and return its rent to whoever paid for this delivery.
        token_interface::close_account(CpiContext::new_with_signer(
            a.token_program.to_account_info(),
            CloseAccount {
                account: a.escrow.to_account_info(),
                destination: a.payer.to_account_info(),
                authority: a.switch.to_account_info(),
            },
            signer,
        ))?;
    }

    let s = &mut ctx.accounts.switch;
    s.assets[i].delivered |= 1u64 << h;
    if done {
        s.assets[i].state = ASSET_DELIVERED;
    }
    emit!(Delivered {
        switch: switch_key,
        index,
        heir: heir.wallet,
        mint: asset.mint,
        amount: share,
        to_treasury: false,
        at,
    });
    maybe_finalize(s, switch_key, at);
    Ok(())
}

#[derive(Accounts)]
pub struct DeliverSol<'info> {
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [SWITCH_SEED, switch.owner.as_ref(), &switch.id.to_le_bytes()], bump = switch.bump)]
    pub switch: Account<'info, Switch>,
    /// CHECK: must equal the heir's wallet stored in the switch; receives native SOL.
    #[account(mut)]
    pub heir: UncheckedAccount<'info>,
    #[account(mut, seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: SystemAccount<'info>,
}

/// Sends one heir their share of settled SOL as native SOL.
pub fn deliver_sol(ctx: Context<DeliverSol>, index: u8, heir_index: u8) -> Result<()> {
    let at = now()?;
    let a = &ctx.accounts;
    let switch_key = a.switch.key();
    require!(a.switch.status == STATUS_TRIGGERED, PerpetuaError::NotTriggered);
    let i = index as usize;
    let h = heir_index as usize;
    require!(i < a.switch.assets.len(), PerpetuaError::BadAssetIndex);
    require!(h < a.switch.heirs.len(), PerpetuaError::BadHeirIndex);
    let asset = a.switch.assets[i];
    require!(asset.state == ASSET_SETTLED, PerpetuaError::BadAssetState);
    require!(asset.kind == KIND_SOL, PerpetuaError::BadAssetState);
    require!(asset.delivered & (1u64 << h) == 0, PerpetuaError::AlreadyDelivered);
    let heir = a.switch.heirs[h];
    require_keys_eq!(a.heir.key(), heir.wallet, PerpetuaError::AccountMismatch);
    let share = share_of(&asset, &a.switch.heirs, h)?;

    // An empty wallet cannot be opened with less than the rent-exempt minimum. A share that
    // small goes to the treasury instead of blocking the other heirs.
    let min = Rent::get()?.minimum_balance(0);
    let to_treasury = share > 0 && a.heir.lamports() == 0 && share < min;
    let switch_ai = a.switch.to_account_info();
    if to_treasury {
        move_lamports(&switch_ai, &a.treasury.to_account_info(), share)?;
    } else {
        move_lamports(&switch_ai, &a.heir.to_account_info(), share)?;
    }

    let heirs = a.switch.heirs.len();
    let s = &mut ctx.accounts.switch;
    s.assets[i].delivered |= 1u64 << h;
    if s.assets[i].delivered == all_heirs_mask(heirs) {
        s.assets[i].state = ASSET_DELIVERED;
    }
    emit!(Delivered {
        switch: switch_key,
        index,
        heir: heir.wallet,
        mint: native_mint::ID,
        amount: share,
        to_treasury,
        at,
    });
    maybe_finalize(s, switch_key, at);
    Ok(())
}

#[derive(Accounts)]
pub struct SkipAsset<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [SWITCH_SEED, switch.owner.as_ref(), &switch.id.to_le_bytes()], bump = switch.bump)]
    pub switch: Account<'info, Switch>,
    /// CHECK: the owner's token account for this asset.
    pub source: UncheckedAccount<'info>,
}

/// Marks an asset as undeliverable so the switch can finish. Allowed only when the
/// account provably cannot be settled (closed, re-delegated, frozen, empty), or once
/// SKIP_AFTER_DAYS have passed since execution started.
pub fn skip_asset(ctx: Context<SkipAsset>, index: u8) -> Result<()> {
    let at = now()?;
    let switch_key = ctx.accounts.switch.key();
    let s = &ctx.accounts.switch;
    require!(s.status == STATUS_TRIGGERED, PerpetuaError::NotTriggered);
    let i = index as usize;
    require!(i < s.assets.len(), PerpetuaError::BadAssetIndex);
    let asset = s.assets[i];
    require!(asset.state == ASSET_PENDING, PerpetuaError::BadAssetState);
    require_keys_eq!(ctx.accounts.source.key(), asset.token_account, PerpetuaError::AccountMismatch);
    let (available, mut reason) =
        available_from_source(&ctx.accounts.source.to_account_info(), &asset, &switch_key, &s.owner);
    if available > 0 {
        require!(
            at >= s.triggered_at.saturating_add(SKIP_AFTER_DAYS * DAY_SECONDS),
            PerpetuaError::CannotSkipYet
        );
        reason = SKIP_TIMED_OUT;
    }
    let s = &mut ctx.accounts.switch;
    s.assets[i].state = ASSET_SKIPPED;
    emit!(AssetSkipped {
        switch: switch_key,
        index,
        mint: asset.mint,
        reason,
        at,
    });
    maybe_finalize(s, switch_key, at);
    Ok(())
}
