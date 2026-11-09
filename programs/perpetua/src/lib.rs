#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;
use state::HeirInput;

#[cfg(feature = "devnet")]
declare_id!("PerpfW46kjYYhYcPzNxnyuTrsWBSNXax953aPrd3FCo");
#[cfg(not(feature = "devnet"))]
declare_id!("PerpX2pWbVffrbJfb4zbDtGkJeWGyucH2HVPkvdpDit");

#[cfg(not(feature = "no-entrypoint"))]
solana_security_txt::security_txt! {
    name: "Perpetua",
    project_url: "https://perpetuaprotocol.xyz",
    contacts: "email:support@perpetuaprotocol.xyz,link:https://perpetuaprotocol.xyz/security",
    policy: "https://perpetuaprotocol.xyz/.well-known/security.txt",
    preferred_languages: "en",
    source_code: "https://github.com/perpetuaxyz/perpetua-program",
    auditors: "None yet. See https://perpetuaprotocol.xyz/security for the current audit status."
}

#[program]
pub mod perpetua {
    use super::*;

    // Admin
    pub fn initialize(ctx: Context<Initialize>, engine: Pubkey) -> Result<()> {
        instructions::admin::initialize(ctx, engine)
    }
    pub fn set_engine(ctx: Context<AdminOnly>, engine: Pubkey) -> Result<()> {
        instructions::admin::set_engine(ctx, engine)
    }
    pub fn set_paused(ctx: Context<AdminOnly>, paused: bool) -> Result<()> {
        instructions::admin::set_paused(ctx, paused)
    }
    pub fn set_admin(ctx: Context<AdminOnly>, new_admin: Pubkey) -> Result<()> {
        instructions::admin::set_admin(ctx, new_admin)
    }
    pub fn set_perpetua_mint(ctx: Context<SetPerpetuaMint>) -> Result<()> {
        instructions::admin::set_perpetua_mint(ctx)
    }
    pub fn sweep_sol(ctx: Context<SweepSol>, amount: u64) -> Result<()> {
        instructions::admin::sweep_sol(ctx, amount)
    }
    pub fn sweep_token(ctx: Context<SweepToken>, amount: u64) -> Result<()> {
        instructions::admin::sweep_token(ctx, amount)
    }

    // Owner
    pub fn create_switch(ctx: Context<CreateSwitch>, id: u32, interval_secs: i64, heirs: Vec<HeirInput>) -> Result<()> {
        instructions::switch::create_switch(ctx, id, interval_secs, heirs)
    }
    pub fn update_heirs(ctx: Context<OwnerEdit>, heirs: Vec<HeirInput>) -> Result<()> {
        instructions::switch::update_heirs(ctx, heirs)
    }
    pub fn update_interval(ctx: Context<OwnerEdit>, interval_secs: i64) -> Result<()> {
        instructions::switch::update_interval(ctx, interval_secs)
    }
    pub fn set_letters(ctx: Context<OwnerEdit>, letters: Vec<[u8; 32]>) -> Result<()> {
        instructions::switch::set_letters(ctx, letters)
    }
    pub fn set_asset_recipient(ctx: Context<OwnerEdit>, index: u8, recipient: u8) -> Result<()> {
        instructions::switch::set_asset_recipient(ctx, index, recipient)
    }
    pub fn add_token_asset(ctx: Context<AddTokenAsset>, amount: u64, recipient: u8) -> Result<()> {
        instructions::assets::add_token_asset(ctx, amount, recipient)
    }
    pub fn set_asset_amount(ctx: Context<SetAssetAmount>, index: u8, amount: u64) -> Result<()> {
        instructions::assets::set_asset_amount(ctx, index, amount)
    }
    pub fn add_sol_asset(ctx: Context<AddSolAsset>, lamports: u64, recipient: u8) -> Result<()> {
        instructions::assets::add_sol_asset(ctx, lamports, recipient)
    }
    pub fn fund_sol(ctx: Context<FundSol>, lamports: u64) -> Result<()> {
        instructions::assets::fund_sol(ctx, lamports)
    }
    pub fn remove_asset(ctx: Context<RemoveAsset>, index: u8) -> Result<()> {
        instructions::assets::remove_asset(ctx, index)
    }
    pub fn check_in(ctx: Context<OwnerOnly>) -> Result<()> {
        instructions::switch::check_in(ctx)
    }
    pub fn pause(ctx: Context<OwnerOnly>) -> Result<()> {
        instructions::switch::pause(ctx)
    }
    pub fn resume(ctx: Context<OwnerOnly>) -> Result<()> {
        instructions::switch::resume(ctx)
    }
    pub fn cancel<'info>(ctx: Context<'_, '_, 'info, 'info, Cancel<'info>>) -> Result<()> {
        instructions::switch::cancel(ctx)
    }

    // Execution (permissionless)
    pub fn trigger(ctx: Context<Trigger>) -> Result<()> {
        instructions::execution::trigger(ctx)
    }
    pub fn settle_asset(ctx: Context<SettleAsset>, index: u8) -> Result<()> {
        instructions::execution::settle_asset(ctx, index)
    }
    pub fn deliver_token(ctx: Context<DeliverToken>, index: u8, heir_index: u8) -> Result<()> {
        instructions::execution::deliver_token(ctx, index, heir_index)
    }
    pub fn deliver_sol(ctx: Context<DeliverSol>, index: u8, heir_index: u8) -> Result<()> {
        instructions::execution::deliver_sol(ctx, index, heir_index)
    }
    pub fn skip_asset(ctx: Context<SkipAsset>, index: u8) -> Result<()> {
        instructions::execution::skip_asset(ctx, index)
    }
}
