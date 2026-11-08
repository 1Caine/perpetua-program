use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::spl_token::native_mint;
use anchor_spl::token::Token;
use anchor_spl::token_2022::spl_token_2022::state::AccountState;
use anchor_spl::token_2022::Token2022;
use anchor_spl::token_interface::{self, ApproveChecked, Mint, SyncNative, TokenAccount, TokenInterface};

use crate::constants::*;
use crate::errors::PerpetuaError;
use crate::events::*;
use crate::instructions::switch::release_asset;
use crate::state::*;
use crate::utils::*;

#[derive(Accounts)]
pub struct AddTokenAsset<'info> {
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
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    pub tier_holding: Option<InterfaceAccount<'info, TokenAccount>>,
    pub tier_mint: Option<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

/// Adds an SPL token or NFT: the owner approves the switch PDA as delegate for `amount`.
/// Tokens stay in the owner's account until execution.
pub fn add_token_asset(ctx: Context<AddTokenAsset>, amount: u64, recipient: u8) -> Result<()> {
    let a = &ctx.accounts;
    let at = now()?;
    let switch_key = a.switch.key();
    require!(a.switch.editable(), PerpetuaError::NotEditable);
    require!(a.switch.assets.len() < MAX_ASSETS as usize, PerpetuaError::TooManyAssets);
    require!(amount > 0, PerpetuaError::ZeroAmount);
    require_keys_neq!(a.mint.key(), native_mint::ID, PerpetuaError::UseSolInstruction);
    require!(
        !a.switch.assets.iter().any(|x| x.token_account == a.token_account.key()),
        PerpetuaError::DuplicateAsset
    );
    require!(a.token_account.state != AccountState::Frozen, PerpetuaError::AccountFrozen);
    if let Some(d) = Option::<Pubkey>::from(a.token_account.delegate) {
        require_keys_eq!(d, switch_key, PerpetuaError::AlreadyDelegated);
    }
    let facts = inspect_mint(&a.mint)?;
    let kind = if facts.is_nft { KIND_NFT } else { KIND_TOKEN };
    let amount = if facts.is_nft { 1 } else { amount };
    let tier = resolve_tier(&a.config, &a.owner.key(), &a.tier_holding, &a.tier_mint)?;

    token_interface::approve_checked(
        CpiContext::new(
            a.token_program.to_account_info(),
            ApproveChecked {
                to: a.token_account.to_account_info(),
                mint: a.mint.to_account_info(),
                delegate: a.switch.to_account_info(),
                authority: a.owner.to_account_info(),
            },
        ),
        amount,
        a.mint.decimals,
    )?;

    let asset = Asset {
        kind,
        mint: a.mint.key(),
        token_account: a.token_account.key(),
        token_2022: a.token_program.key() == anchor_spl::token_2022::ID,
        recipient,
        state: ASSET_PENDING,
        approved: amount,
        escrowed: 0,
        fee: 0,
        delivered: 0,
    };
    let s = &mut ctx.accounts.switch;
    s.assets.push(asset);
    validate_switch_for_tier(s, tier)?;
    s.tier = tier;
    touch(s, at);
    let index = (s.assets.len() - 1) as u8;
    fit_switch(
        &ctx.accounts.switch.to_account_info(),
        &ctx.accounts.switch,
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
    )?;
    emit!(AssetAdded {
        switch: switch_key,
        index,
        kind,
        mint: asset.mint,
        amount,
        recipient,
        at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetAssetAmount<'info> {
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
    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = owner, token::token_program = token_program)]
    pub token_account: InterfaceAccount<'info, TokenAccount>,
    pub tier_holding: Option<InterfaceAccount<'info, TokenAccount>>,
    pub tier_mint: Option<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Changes how much of a token the switch may deliver (re-approves the delegation).
pub fn set_asset_amount(ctx: Context<SetAssetAmount>, index: u8, amount: u64) -> Result<()> {
    let a = &ctx.accounts;
    let at = now()?;
    let switch_key = a.switch.key();
    require!(a.switch.editable(), PerpetuaError::NotEditable);
    let i = index as usize;
    require!(i < a.switch.assets.len(), PerpetuaError::BadAssetIndex);
    let asset = a.switch.assets[i];
    require!(asset.kind == KIND_TOKEN, PerpetuaError::BadAssetState);
    require!(amount > 0, PerpetuaError::ZeroAmount);
    require_keys_eq!(a.token_account.key(), asset.token_account, PerpetuaError::AccountMismatch);
    require!(a.token_account.state != AccountState::Frozen, PerpetuaError::AccountFrozen);
    if let Some(d) = Option::<Pubkey>::from(a.token_account.delegate) {
        require_keys_eq!(d, switch_key, PerpetuaError::AlreadyDelegated);
    }
    let tier = resolve_tier(&a.config, &a.owner.key(), &a.tier_holding, &a.tier_mint)?;
    token_interface::approve_checked(
        CpiContext::new(
            a.token_program.to_account_info(),
            ApproveChecked {
                to: a.token_account.to_account_info(),
                mint: a.mint.to_account_info(),
                delegate: a.switch.to_account_info(),
                authority: a.owner.to_account_info(),
            },
        ),
        amount,
        a.mint.decimals,
    )?;
    let s = &mut ctx.accounts.switch;
    s.assets[i].approved = amount;
    validate_switch_for_tier(s, tier)?;
    s.tier = tier;
    touch(s, at);
    emit!(AssetUpdated {
        switch: switch_key,
        index,
        mint: asset.mint,
        amount,
        recipient: asset.recipient,
        at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AddSolAsset<'info> {
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
    #[account(address = native_mint::ID)]
    pub native_mint: InterfaceAccount<'info, Mint>,
    /// The owner's own wSOL reserve: a token account whose authority is the owner, at an
    /// address derived from the switch so DEX routers never touch or close it.
    #[account(
        init_if_needed,
        payer = owner,
        seeds = [RESERVE_SEED, switch.key().as_ref()],
        bump,
        token::mint = native_mint,
        token::authority = owner,
        token::token_program = token_program
    )]
    pub reserve: InterfaceAccount<'info, TokenAccount>,
    pub tier_holding: Option<InterfaceAccount<'info, TokenAccount>>,
    pub tier_mint: Option<InterfaceAccount<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Sets SOL aside for heirs: wraps `lamports` into the owner's reserve and delegates it.
pub fn add_sol_asset(ctx: Context<AddSolAsset>, lamports: u64, recipient: u8) -> Result<()> {
    let at = now()?;
    let switch_key = ctx.accounts.switch.key();
    {
        let s = &ctx.accounts.switch;
        require!(s.editable(), PerpetuaError::NotEditable);
        require!(s.assets.len() < MAX_ASSETS as usize, PerpetuaError::TooManyAssets);
        require!(!s.assets.iter().any(|x| x.kind == KIND_SOL), PerpetuaError::SolAlreadyAdded);
    }
    require!(lamports >= MIN_SOL_LAMPORTS, PerpetuaError::SolBelowMinimum);
    let a = &ctx.accounts;
    let tier = resolve_tier(&a.config, &a.owner.key(), &a.tier_holding, &a.tier_mint)?;
    wrap_and_delegate(
        &a.owner.to_account_info(),
        &a.reserve.to_account_info(),
        &a.native_mint.to_account_info(),
        &a.switch.to_account_info(),
        &a.token_program.to_account_info(),
        &a.system_program.to_account_info(),
        lamports,
        lamports,
    )?;
    let asset = Asset {
        kind: KIND_SOL,
        mint: native_mint::ID,
        token_account: a.reserve.key(),
        token_2022: false,
        recipient,
        state: ASSET_PENDING,
        approved: lamports,
        escrowed: 0,
        fee: 0,
        delivered: 0,
    };
    let reserve_bump = ctx.bumps.reserve;
    let s = &mut ctx.accounts.switch;
    s.reserve_bump = reserve_bump;
    s.assets.push(asset);
    validate_switch_for_tier(s, tier)?;
    s.tier = tier;
    touch(s, at);
    let index = (s.assets.len() - 1) as u8;
    fit_switch(
        &ctx.accounts.switch.to_account_info(),
        &ctx.accounts.switch,
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
    )?;
    emit!(AssetAdded {
        switch: switch_key,
        index,
        kind: KIND_SOL,
        mint: native_mint::ID,
        amount: lamports,
        recipient,
        at,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct FundSol<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [SWITCH_SEED, owner.key().as_ref(), &switch.id.to_le_bytes()],
        bump = switch.bump,
        has_one = owner
    )]
    pub switch: Account<'info, Switch>,
    #[account(address = native_mint::ID)]
    pub native_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [RESERVE_SEED, switch.key().as_ref()],
        bump = switch.reserve_bump,
        token::mint = native_mint,
        token::authority = owner,
        token::token_program = token_program
    )]
    pub reserve: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Adds more SOL to the reserve and extends the delegation to the new total.
pub fn fund_sol(ctx: Context<FundSol>, lamports: u64) -> Result<()> {
    let at = now()?;
    let switch_key = ctx.accounts.switch.key();
    require!(ctx.accounts.switch.editable(), PerpetuaError::NotEditable);
    require!(lamports > 0, PerpetuaError::ZeroAmount);
    let i = ctx
        .accounts
        .switch
        .assets
        .iter()
        .position(|x| x.kind == KIND_SOL)
        .ok_or(PerpetuaError::BadAssetIndex)?;
    if let Some(d) = Option::<Pubkey>::from(ctx.accounts.reserve.delegate) {
        require_keys_eq!(d, switch_key, PerpetuaError::AlreadyDelegated);
    }
    let total = ctx
        .accounts
        .reserve
        .amount
        .checked_add(lamports)
        .ok_or(PerpetuaError::Overflow)?;
    let a = &ctx.accounts;
    wrap_and_delegate(
        &a.owner.to_account_info(),
        &a.reserve.to_account_info(),
        &a.native_mint.to_account_info(),
        &a.switch.to_account_info(),
        &a.token_program.to_account_info(),
        &a.system_program.to_account_info(),
        lamports,
        total,
    )?;
    let s = &mut ctx.accounts.switch;
    s.assets[i].approved = total;
    touch(s, at);
    let asset = s.assets[i];
    emit!(AssetUpdated {
        switch: switch_key,
        index: i as u8,
        mint: native_mint::ID,
        amount: total,
        recipient: asset.recipient,
        at,
    });
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn wrap_and_delegate<'info>(
    owner: &AccountInfo<'info>,
    reserve: &AccountInfo<'info>,
    native: &AccountInfo<'info>,
    switch: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    add: u64,
    approve_total: u64,
) -> Result<()> {
    system_program::transfer(
        CpiContext::new(
            system_program.clone(),
            system_program::Transfer {
                from: owner.clone(),
                to: reserve.clone(),
            },
        ),
        add,
    )?;
    token_interface::sync_native(CpiContext::new(
        token_program.clone(),
        SyncNative {
            account: reserve.clone(),
        },
    ))?;
    token_interface::approve_checked(
        CpiContext::new(
            token_program.clone(),
            ApproveChecked {
                to: reserve.clone(),
                mint: native.clone(),
                delegate: switch.clone(),
                authority: owner.clone(),
            },
        ),
        approve_total,
        9,
    )
}

#[derive(Accounts)]
pub struct RemoveAsset<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [SWITCH_SEED, owner.key().as_ref(), &switch.id.to_le_bytes()],
        bump = switch.bump,
        has_one = owner
    )]
    pub switch: Account<'info, Switch>,
    /// CHECK: must equal the asset's token account; may have been closed by the owner.
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

/// Removes an asset: revokes the delegation (or unwraps the SOL reserve) and shrinks the switch.
pub fn remove_asset(ctx: Context<RemoveAsset>, index: u8) -> Result<()> {
    let at = now()?;
    let switch_key = ctx.accounts.switch.key();
    require!(ctx.accounts.switch.editable(), PerpetuaError::NotEditable);
    let i = index as usize;
    require!(i < ctx.accounts.switch.assets.len(), PerpetuaError::BadAssetIndex);
    let asset = ctx.accounts.switch.assets[i];
    require_keys_eq!(
        ctx.accounts.token_account.key(),
        asset.token_account,
        PerpetuaError::AccountMismatch
    );
    release_asset(
        &asset,
        &ctx.accounts.token_account.to_account_info(),
        &switch_key,
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.token_2022_program.to_account_info(),
    )?;
    let s = &mut ctx.accounts.switch;
    s.assets.remove(i);
    touch(s, at);
    fit_switch(
        &ctx.accounts.switch.to_account_info(),
        &ctx.accounts.switch,
        &ctx.accounts.owner.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
    )?;
    emit!(AssetRemoved {
        switch: switch_key,
        mint: asset.mint,
        at,
    });
    Ok(())
}
