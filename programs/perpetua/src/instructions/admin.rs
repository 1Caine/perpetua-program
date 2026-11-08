use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

use crate::constants::*;
use crate::errors::PerpetuaError;
use crate::events::*;
use crate::program::Perpetua;
use crate::state::*;
use crate::utils::now;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = Config::SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TREASURY_SEED], bump)]
    pub treasury: SystemAccount<'info>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ PerpetuaError::NotUpgradeAuthority)]
    pub program: Program<'info, Perpetua>,
    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ PerpetuaError::NotUpgradeAuthority)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

/// One-time setup by the upgrade authority (prevents anyone front-running initialization).
pub fn initialize(ctx: Context<Initialize>, engine: Pubkey) -> Result<()> {
    let c = &mut ctx.accounts.config;
    c.admin = ctx.accounts.admin.key();
    c.engine = engine;
    c.perpetua_mint = Pubkey::default();
    c.paused = false;
    c.bump = ctx.bumps.config;
    c.treasury_bump = ctx.bumps.treasury;
    c.switches_created = 0;
    c.switches_active = 0;
    c.executions = 0;
    c._reserved = [0u8; 64];

    // The treasury is a plain system account PDA. Funding it with its minimum balance
    // up front means small fee credits never fail the rent check.
    let min = Rent::get()?.minimum_balance(0);
    let have = ctx.accounts.treasury.lamports();
    if have < min {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.admin.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            min - have,
        )?;
    }
    emit_config(c)
}

fn emit_config(c: &Config) -> Result<()> {
    emit!(ConfigChanged {
        admin: c.admin,
        engine: c.engine,
        perpetua_mint: c.perpetua_mint,
        paused: c.paused,
        at: now()?,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ PerpetuaError::Unauthorized)]
    pub config: Account<'info, Config>,
}

pub fn set_engine(ctx: Context<AdminOnly>, engine: Pubkey) -> Result<()> {
    ctx.accounts.config.engine = engine;
    emit_config(&ctx.accounts.config)
}

pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
    ctx.accounts.config.paused = paused;
    emit_config(&ctx.accounts.config)
}

pub fn set_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
    require_keys_neq!(new_admin, Pubkey::default(), PerpetuaError::Unauthorized);
    ctx.accounts.config.admin = new_admin;
    emit_config(&ctx.accounts.config)
}

#[derive(Accounts)]
pub struct SetPerpetuaMint<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ PerpetuaError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub mint: InterfaceAccount<'info, Mint>,
}

/// Sets the $PERPETUA mint for tier checks. Allowed once, so the admin can never
/// swap in a different token to hand out tiers.
pub fn set_perpetua_mint(ctx: Context<SetPerpetuaMint>) -> Result<()> {
    require_keys_eq!(ctx.accounts.config.perpetua_mint, Pubkey::default(), PerpetuaError::MintAlreadySet);
    ctx.accounts.config.perpetua_mint = ctx.accounts.mint.key();
    emit_config(&ctx.accounts.config)
}

#[derive(Accounts)]
pub struct SweepSol<'info> {
    #[account(mut)]
    pub engine: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = engine @ PerpetuaError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Moves treasury SOL to the buyback engine. Only the engine wallet can call it.
pub fn sweep_sol(ctx: Context<SweepSol>, amount: u64) -> Result<()> {
    require!(amount > 0, PerpetuaError::ZeroAmount);
    let min = Rent::get()?.minimum_balance(0);
    let have = ctx.accounts.treasury.lamports();
    require!(have.saturating_sub(amount) >= min, PerpetuaError::TreasuryMinimum);
    let bump = [ctx.accounts.config.treasury_bump];
    let seeds: &[&[u8]] = &[TREASURY_SEED, &bump];
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.engine.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;
    emit!(TreasurySwept {
        mint: Pubkey::default(),
        amount,
        to: ctx.accounts.engine.key(),
        at: now()?,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SweepToken<'info> {
    pub engine: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = engine @ PerpetuaError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(seeds = [TREASURY_SEED], bump = config.treasury_bump)]
    pub treasury: SystemAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = mint, token::authority = treasury, token::token_program = token_program)]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = engine, token::token_program = token_program)]
    pub engine_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

/// Moves execution fees collected in a token to the buyback engine, which swaps them.
pub fn sweep_token(ctx: Context<SweepToken>, amount: u64) -> Result<()> {
    require!(amount > 0, PerpetuaError::ZeroAmount);
    let bump = [ctx.accounts.config.treasury_bump];
    let seeds: &[&[u8]] = &[TREASURY_SEED, &bump];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.treasury_token.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.engine_token.to_account_info(),
                authority: ctx.accounts.treasury.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;
    emit!(TreasurySwept {
        mint: ctx.accounts.mint.key(),
        amount,
        to: ctx.accounts.engine.key(),
        at: now()?,
    });
    Ok(())
}
