use anchor_lang::prelude::*;

#[account]
pub struct Config {
    /// Can set the engine wallet, pause new setups and set the $PERPETUA mint once.
    /// Cannot touch any switch or any user asset.
    pub admin: Pubkey,
    /// Buyback engine wallet: the only key that can move funds out of the treasury PDA.
    pub engine: Pubkey,
    /// $PERPETUA mint used for tier checks. Default (all zeros) until set; set once only.
    pub perpetua_mint: Pubkey,
    /// Pauses creation of new switches only. Check-ins, edits, cancels and execution never pause.
    pub paused: bool,
    pub bump: u8,
    pub treasury_bump: u8,
    pub switches_created: u64,
    pub switches_active: u64,
    pub executions: u64,
    pub _reserved: [u8; 64],
}

impl Config {
    pub const SPACE: usize = 8 + 32 * 3 + 1 + 1 + 1 + 8 * 3 + 64;
}

#[account]
pub struct OwnerProfile {
    pub owner: Pubkey,
    pub active_switches: u32,
    pub next_id: u32,
    pub bump: u8,
}

impl OwnerProfile {
    pub const SPACE: usize = 8 + 32 + 4 + 4 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct HeirInput {
    pub wallet: Pubkey,
    pub bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Heir {
    pub wallet: Pubkey,
    /// Share in basis points. All heirs sum to exactly 10_000.
    pub bps: u16,
    /// SHA-256 of the sealed letter envelope for this heir, or zeros for no letter.
    pub letter: [u8; 32],
}

impl Heir {
    pub const SIZE: usize = 32 + 2 + 32;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Asset {
    pub kind: u8,
    pub mint: Pubkey,
    /// The owner's token account the switch PDA is delegate on. For SOL this is the
    /// owner's reserve wSOL account (authority = owner).
    pub token_account: Pubkey,
    pub token_2022: bool,
    /// Heir index that receives the whole asset, or SPLIT.
    pub recipient: u8,
    pub state: u8,
    /// Amount approved (delegated) at the last edit.
    pub approved: u64,
    /// Amount held for heirs after settlement and fee.
    pub escrowed: u64,
    pub fee: u64,
    /// Bit i set = heir i has received their share.
    pub delivered: u64,
}

impl Asset {
    pub const SIZE: usize = 1 + 32 + 32 + 1 + 1 + 1 + 8 + 8 + 8 + 8;
}

/// Field order is part of the public interface: the letter release service reads
/// `status` at byte offset 45 (8 discriminator + 32 owner + 4 id + 1 bump).
#[account]
pub struct Switch {
    pub owner: Pubkey,
    pub id: u32,
    pub bump: u8,
    pub status: u8,
    pub tier: u8,
    pub reserve_bump: u8,
    pub interval_secs: i64,
    pub grace_secs: i64,
    pub created_at: i64,
    pub last_check_in: i64,
    pub triggered_at: i64,
    pub executed_at: i64,
    pub check_ins: u32,
    pub heirs: Vec<Heir>,
    pub assets: Vec<Asset>,
}

impl Switch {
    pub const STATUS_OFFSET: usize = 45;
    pub const BASE: usize = 8 + 32 + 4 + 1 + 1 + 1 + 1 + 8 * 6 + 4 + 4 + 4;

    pub fn space(heirs: usize, assets: usize) -> usize {
        Self::BASE + heirs * Heir::SIZE + assets * Asset::SIZE
    }

    pub fn deadline(&self) -> i64 {
        self.last_check_in.saturating_add(self.interval_secs)
    }

    pub fn executable_at(&self) -> i64 {
        self.deadline().saturating_add(self.grace_secs)
    }

    pub fn editable(&self) -> bool {
        self.status == crate::constants::STATUS_ACTIVE || self.status == crate::constants::STATUS_PAUSED
    }
}
