use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token_2022::spl_token_2022;
use anchor_spl::token_2022::spl_token_2022::extension::{
    default_account_state::DefaultAccountState, transfer_hook::TransferHook, BaseStateWithExtensions,
    ExtensionType, StateWithExtensions,
};
use anchor_spl::token_2022::spl_token_2022::state::AccountState;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::constants::*;
use crate::errors::PerpetuaError;
use crate::state::*;

pub fn now() -> Result<i64> {
    Ok(Clock::get()?.unix_timestamp)
}

/// Tier from the owner's $PERPETUA balance. No mint set, or no holding passed, means Free.
pub fn resolve_tier<'info>(
    config: &Config,
    owner: &Pubkey,
    holding: &Option<InterfaceAccount<'info, TokenAccount>>,
    mint: &Option<InterfaceAccount<'info, Mint>>,
) -> Result<u8> {
    if config.perpetua_mint == Pubkey::default() {
        return Ok(TIER_FREE);
    }
    let (Some(holding), Some(mint)) = (holding, mint) else {
        return Ok(TIER_FREE);
    };
    require_keys_eq!(mint.key(), config.perpetua_mint, PerpetuaError::BadTierAccount);
    require_keys_eq!(holding.mint, config.perpetua_mint, PerpetuaError::BadTierAccount);
    require_keys_eq!(holding.owner, *owner, PerpetuaError::BadTierAccount);
    let unit = 10u64.checked_pow(mint.decimals as u32).ok_or(PerpetuaError::Overflow)?;
    let patron = PATRON_THRESHOLD_TOKENS.checked_mul(unit).ok_or(PerpetuaError::Overflow)?;
    let holder = HOLDER_THRESHOLD_TOKENS.checked_mul(unit).ok_or(PerpetuaError::Overflow)?;
    Ok(if holding.amount >= patron {
        TIER_PATRON
    } else if holding.amount >= holder {
        TIER_HOLDER
    } else {
        TIER_FREE
    })
}

pub fn max_heirs(tier: u8) -> usize {
    match tier {
        TIER_PATRON => PATRON_MAX_HEIRS as usize,
        TIER_HOLDER => HOLDER_MAX_HEIRS as usize,
        _ => FREE_MAX_HEIRS as usize,
    }
}

pub fn max_switches(tier: u8) -> u32 {
    match tier {
        TIER_PATRON => u32::MAX,
        TIER_HOLDER => HOLDER_MAX_SWITCHES,
        _ => FREE_MAX_SWITCHES,
    }
}

pub fn validate_interval(tier: u8, interval_secs: i64) -> Result<()> {
    if tier == TIER_PATRON {
        require!(
            interval_secs >= CUSTOM_INTERVAL_MIN_DAYS * DAY_SECONDS
                && interval_secs <= CUSTOM_INTERVAL_MAX_DAYS * DAY_SECONDS,
            PerpetuaError::BadInterval
        );
    } else {
        require!(
            STANDARD_INTERVAL_DAYS.iter().any(|d| d * DAY_SECONDS == interval_secs),
            PerpetuaError::BadInterval
        );
    }
    Ok(())
}

pub fn validate_heirs(owner: &Pubkey, switch: &Pubkey, heirs: &[HeirInput], tier: u8) -> Result<()> {
    require!(!heirs.is_empty(), PerpetuaError::NoHeirs);
    require!(heirs.len() <= max_heirs(tier), PerpetuaError::TooManyHeirs);
    let mut total: u64 = 0;
    for (i, h) in heirs.iter().enumerate() {
        require!(h.bps > 0, PerpetuaError::ZeroShare);
        require!(
            h.wallet != Pubkey::default() && h.wallet != *owner && h.wallet != *switch,
            PerpetuaError::InvalidHeir
        );
        for other in heirs.iter().skip(i + 1) {
            require!(other.wallet != h.wallet, PerpetuaError::DuplicateHeir);
        }
        total += h.bps as u64;
    }
    require!(total == BPS_DENOMINATOR, PerpetuaError::SharesNot100);
    Ok(())
}

/// Re-checks a whole switch against a tier. Runs on every owner edit.
pub fn validate_switch_for_tier(switch: &Switch, tier: u8) -> Result<()> {
    require!(switch.heirs.len() <= max_heirs(tier), PerpetuaError::TooManyHeirs);
    validate_interval(tier, switch.interval_secs)?;
    for a in switch.assets.iter() {
        if a.kind == KIND_NFT {
            require!(tier >= TIER_HOLDER, PerpetuaError::NftNeedsHolder);
            require!(a.recipient != SPLIT, PerpetuaError::NftNeedsRecipient);
        }
        if a.recipient != SPLIT {
            require!((a.recipient as usize) < switch.heirs.len(), PerpetuaError::BadRecipient);
        }
    }
    Ok(())
}

/// Any change the owner signs proves they are here, so it also resets the timer.
pub fn touch(switch: &mut Switch, at: i64) {
    if switch.status == STATUS_ACTIVE {
        switch.last_check_in = at;
    }
}

pub fn token_program_for(asset: &Asset) -> Pubkey {
    if asset.token_2022 {
        anchor_spl::token_2022::ID
    } else {
        anchor_spl::token::ID
    }
}

pub struct MintFacts {
    pub is_nft: bool,
    pub has_transfer_fee: bool,
}

/// Rejects mints whose extensions would make delivery unsafe or impossible.
pub fn inspect_mint<'info>(mint: &InterfaceAccount<'info, Mint>) -> Result<MintFacts> {
    let info = mint.to_account_info();
    let mut has_transfer_fee = false;
    if *info.owner == anchor_spl::token_2022::ID {
        let data = info.try_borrow_data()?;
        let state = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&data)?;
        for ext in state.get_extension_types()? {
            match ext {
                ExtensionType::NonTransferable | ExtensionType::ConfidentialTransferMint => {
                    return err!(PerpetuaError::UnsupportedMint)
                }
                ExtensionType::TransferHook => {
                    let hook = state.get_extension::<TransferHook>()?;
                    if Option::<Pubkey>::from(hook.program_id).is_some() {
                        return err!(PerpetuaError::UnsupportedMint);
                    }
                }
                ExtensionType::DefaultAccountState => {
                    let das = state.get_extension::<DefaultAccountState>()?;
                    if das.state == AccountState::Frozen as u8 {
                        return err!(PerpetuaError::UnsupportedMint);
                    }
                }
                ExtensionType::TransferFeeConfig => has_transfer_fee = true,
                _ => {}
            }
        }
    }
    Ok(MintFacts {
        is_nft: mint.decimals == 0 && mint.supply == 1,
        has_transfer_fee,
    })
}

pub fn mint_has_transfer_fee(mint: &AccountInfo) -> Result<bool> {
    if *mint.owner != anchor_spl::token_2022::ID {
        return Ok(false);
    }
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&data)?;
    Ok(state
        .get_extension_types()?
        .iter()
        .any(|e| *e == ExtensionType::TransferFeeConfig))
}

/// Balance of a token account given as a raw AccountInfo (classic or Token-2022).
pub fn token_balance(ai: &AccountInfo) -> Result<u64> {
    let data = ai.try_borrow_data()?;
    let state = StateWithExtensions::<spl_token_2022::state::Account>::unpack(&data)?;
    Ok(state.base.amount)
}

/// What the switch may move from the owner's account right now, and why not if zero.
/// Never fails: a closed, re-delegated, frozen or empty account yields (0, reason).
pub fn available_from_source(
    source: &AccountInfo,
    asset: &Asset,
    switch_key: &Pubkey,
    owner: &Pubkey,
) -> (u64, u8) {
    if source.data_is_empty() || *source.owner != token_program_for(asset) {
        return (0, SKIP_CLOSED);
    }
    let Ok(data) = source.try_borrow_data() else {
        return (0, SKIP_CLOSED);
    };
    let Ok(state) = StateWithExtensions::<spl_token_2022::state::Account>::unpack(&data) else {
        return (0, SKIP_CLOSED);
    };
    let acc = state.base;
    if acc.mint != asset.mint || acc.owner != *owner {
        return (0, SKIP_CLOSED);
    }
    if acc.state == AccountState::Frozen {
        return (0, SKIP_FROZEN);
    }
    let delegate: Option<Pubkey> = acc.delegate.into();
    if delegate != Some(*switch_key) {
        return (0, SKIP_DELEGATION_CHANGED);
    }
    let amount = acc.amount.min(acc.delegated_amount);
    if amount == 0 {
        return (0, SKIP_EMPTY);
    }
    (amount, 0)
}

/// Each heir's share of an escrowed asset. Floor for every heir except the last,
/// who receives the remainder, so the shares always add up to the escrowed amount
/// regardless of the order deliveries happen in.
pub fn share_of(asset: &Asset, heirs: &[Heir], heir_index: usize) -> Result<u64> {
    if asset.recipient != SPLIT {
        return Ok(if heir_index == asset.recipient as usize { asset.escrowed } else { 0 });
    }
    let part = |bps: u16| -> Result<u64> {
        let v = (asset.escrowed as u128)
            .checked_mul(bps as u128)
            .ok_or(PerpetuaError::Overflow)?
            / BPS_DENOMINATOR as u128;
        Ok(v as u64)
    };
    let last = heirs.len() - 1;
    if heir_index < last {
        return part(heirs[heir_index].bps);
    }
    let mut others: u64 = 0;
    for h in heirs.iter().take(last) {
        others = others.checked_add(part(h.bps)?).ok_or(PerpetuaError::Overflow)?;
    }
    asset.escrowed.checked_sub(others).ok_or(error!(PerpetuaError::Overflow))
}

pub fn all_heirs_mask(n: usize) -> u64 {
    if n >= 64 {
        u64::MAX
    } else {
        (1u64 << n) - 1
    }
}

/// Moves to EXECUTED once every asset is delivered or skipped.
pub fn maybe_finalize(switch: &mut Switch, switch_key: Pubkey, at: i64) {
    if switch.status != STATUS_TRIGGERED {
        return;
    }
    if switch
        .assets
        .iter()
        .all(|a| a.state == ASSET_DELIVERED || a.state == ASSET_SKIPPED)
    {
        switch.status = STATUS_EXECUTED;
        switch.executed_at = at;
        emit!(crate::events::SwitchExecuted {
            switch: switch_key,
            owner: switch.owner,
            at,
        });
    }
}

/// Resizes the switch account to fit its heirs and assets. Growth is paid by `payer`
/// (the owner); shrinking refunds the owner.
#[allow(deprecated)]
pub fn fit_switch<'info>(
    switch_ai: &AccountInfo<'info>,
    switch: &Switch,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    let new_len = Switch::space(switch.heirs.len(), switch.assets.len());
    let cur = switch_ai.data_len();
    if new_len == cur {
        return Ok(());
    }
    let need = Rent::get()?.minimum_balance(new_len);
    let have = switch_ai.lamports();
    if need > have {
        system_program::transfer(
            CpiContext::new(
                system_program.clone(),
                system_program::Transfer {
                    from: payer.clone(),
                    to: switch_ai.clone(),
                },
            ),
            need - have,
        )?;
    } else if have > need {
        let diff = have - need;
        **switch_ai.try_borrow_mut_lamports()? -= diff;
        **payer.try_borrow_mut_lamports()? += diff;
    }
    switch_ai.realloc(new_len, true)?;
    Ok(())
}

/// Moves lamports out of a program-owned account (the switch) to any writable account.
pub fn move_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    **from.try_borrow_mut_lamports()? = from
        .lamports()
        .checked_sub(amount)
        .ok_or(PerpetuaError::Overflow)?;
    **to.try_borrow_mut_lamports()? = to.lamports().checked_add(amount).ok_or(PerpetuaError::Overflow)?;
    Ok(())
}
