use anchor_lang::prelude::*;

// Every number the site shows comes from these constants (see scripts/check-config.mjs,
// which compares config/protocol.ts with the IDL). Fees and limits are fixed in code:
// changing any of them needs a program upgrade, which the upgrade authority multisig signs.

/// Length of one "day" in seconds. The devnet build ("short-timers") shrinks a day to one
/// second so a whole cycle (interval, grace, execution) can be watched end to end.
#[cfg(feature = "short-timers")]
pub const DAY_SECONDS: i64 = 1;
#[cfg(not(feature = "short-timers"))]
pub const DAY_SECONDS: i64 = 86_400;

/// One-time fee for a Free-tier switch, paid into the treasury PDA by the program.
#[constant]
pub const SETUP_FEE_LAMPORTS: u64 = 50_000_000;
/// Execution fee on assets delivered, in basis points (0.5%).
#[constant]
pub const EXECUTION_FEE_BPS: u64 = 50;
#[constant]
pub const BPS_DENOMINATOR: u64 = 10_000;
/// Grace period after a missed deadline before anyone can trigger execution.
#[constant]
pub const GRACE_DAYS: i64 = 7;
/// Check-in intervals available to every tier.
#[constant]
pub const STANDARD_INTERVAL_DAYS: [i64; 4] = [30, 90, 180, 365];
/// Patron tier: any interval from 7 days to 5 years.
#[constant]
pub const CUSTOM_INTERVAL_MIN_DAYS: i64 = 7;
#[constant]
pub const CUSTOM_INTERVAL_MAX_DAYS: i64 = 1_825;
/// $PERPETUA held (whole tokens) for each tier.
#[constant]
pub const HOLDER_THRESHOLD_TOKENS: u64 = 1_000_000;
#[constant]
pub const PATRON_THRESHOLD_TOKENS: u64 = 10_000_000;
#[constant]
pub const FREE_MAX_HEIRS: u8 = 2;
#[constant]
pub const HOLDER_MAX_HEIRS: u8 = 10;
/// Protocol maximum. Sixteen heirs is what fits in one wallet-signed transaction
/// with room left for wallet safety guards.
#[constant]
pub const PATRON_MAX_HEIRS: u8 = 16;
#[constant]
pub const FREE_MAX_SWITCHES: u32 = 1;
#[constant]
pub const HOLDER_MAX_SWITCHES: u32 = 3;
/// Assets per switch. Cancelling revokes every delegation in one transaction.
#[constant]
pub const MAX_ASSETS: u8 = 12;
/// After execution starts, an asset that still cannot be settled may be skipped after this long.
#[constant]
pub const SKIP_AFTER_DAYS: i64 = 30;
/// Smallest SOL amount that can be set aside for heirs (0.01 SOL).
#[constant]
pub const MIN_SOL_LAMPORTS: u64 = 10_000_000;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
#[constant]
pub const TREASURY_SEED: &[u8] = b"treasury";
#[constant]
pub const OWNER_SEED: &[u8] = b"owner";
#[constant]
pub const SWITCH_SEED: &[u8] = b"switch";
#[constant]
pub const RESERVE_SEED: &[u8] = b"reserve";

pub const TIER_FREE: u8 = 0;
pub const TIER_HOLDER: u8 = 1;
pub const TIER_PATRON: u8 = 2;

// Status values are ordered on purpose: letters open when status >= TRIGGERED.
pub const STATUS_ACTIVE: u8 = 0;
pub const STATUS_PAUSED: u8 = 1;
pub const STATUS_TRIGGERED: u8 = 2;
pub const STATUS_EXECUTED: u8 = 3;

pub const KIND_SOL: u8 = 0;
pub const KIND_TOKEN: u8 = 1;
pub const KIND_NFT: u8 = 2;

pub const ASSET_PENDING: u8 = 0;
pub const ASSET_SETTLED: u8 = 1;
pub const ASSET_DELIVERED: u8 = 2;
pub const ASSET_SKIPPED: u8 = 3;

/// `recipient` value meaning "split between all heirs by their percentages".
pub const SPLIT: u8 = u8::MAX;

pub const SKIP_CLOSED: u8 = 1;
pub const SKIP_DELEGATION_CHANGED: u8 = 2;
pub const SKIP_FROZEN: u8 = 3;
pub const SKIP_EMPTY: u8 = 4;
pub const SKIP_TIMED_OUT: u8 = 5;
