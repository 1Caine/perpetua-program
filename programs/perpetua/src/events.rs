use anchor_lang::prelude::*;

// Every state change emits an event. /ledger is built from these logs.

#[event]
pub struct SwitchCreated {
    pub switch: Pubkey,
    pub owner: Pubkey,
    pub id: u32,
    pub tier: u8,
    pub interval_secs: i64,
    pub heirs: u8,
    pub fee_lamports: u64,
    pub at: i64,
}

#[event]
pub struct HeirsUpdated {
    pub switch: Pubkey,
    pub heirs: u8,
    pub at: i64,
}

#[event]
pub struct IntervalUpdated {
    pub switch: Pubkey,
    pub interval_secs: i64,
    pub at: i64,
}

#[event]
pub struct LettersUpdated {
    pub switch: Pubkey,
    pub letters: u8,
    pub at: i64,
}

#[event]
pub struct AssetAdded {
    pub switch: Pubkey,
    pub index: u8,
    pub kind: u8,
    pub mint: Pubkey,
    pub amount: u64,
    pub recipient: u8,
    pub at: i64,
}

#[event]
pub struct AssetUpdated {
    pub switch: Pubkey,
    pub index: u8,
    pub mint: Pubkey,
    pub amount: u64,
    pub recipient: u8,
    pub at: i64,
}

#[event]
pub struct AssetRemoved {
    pub switch: Pubkey,
    pub mint: Pubkey,
    pub at: i64,
}

#[event]
pub struct CheckedIn {
    pub switch: Pubkey,
    pub owner: Pubkey,
    pub check_ins: u32,
    pub deadline: i64,
    pub at: i64,
}

#[event]
pub struct SwitchPaused {
    pub switch: Pubkey,
    pub at: i64,
}

#[event]
pub struct SwitchResumed {
    pub switch: Pubkey,
    pub deadline: i64,
    pub at: i64,
}

#[event]
pub struct SwitchCancelled {
    pub switch: Pubkey,
    pub owner: Pubkey,
    pub revoked: u8,
    pub at: i64,
}

#[event]
pub struct SwitchTriggered {
    pub switch: Pubkey,
    pub owner: Pubkey,
    pub caller: Pubkey,
    pub assets: u8,
    pub at: i64,
}

#[event]
pub struct AssetSettled {
    pub switch: Pubkey,
    pub index: u8,
    pub kind: u8,
    pub mint: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub at: i64,
}

#[event]
pub struct AssetSkipped {
    pub switch: Pubkey,
    pub index: u8,
    pub mint: Pubkey,
    pub reason: u8,
    pub at: i64,
}

#[event]
pub struct Delivered {
    pub switch: Pubkey,
    pub index: u8,
    pub heir: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    /// True when a SOL share was too small to open an empty wallet and went to the treasury.
    pub to_treasury: bool,
    pub at: i64,
}

#[event]
pub struct SwitchExecuted {
    pub switch: Pubkey,
    pub owner: Pubkey,
    pub at: i64,
}

#[event]
pub struct TreasurySwept {
    pub mint: Pubkey,
    pub amount: u64,
    pub to: Pubkey,
    pub at: i64,
}

#[event]
pub struct ConfigChanged {
    pub admin: Pubkey,
    pub engine: Pubkey,
    pub perpetua_mint: Pubkey,
    pub paused: bool,
    pub at: i64,
}
