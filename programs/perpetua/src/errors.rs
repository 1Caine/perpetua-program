use anchor_lang::prelude::*;

#[error_code]
pub enum PerpetuaError {
    #[msg("Only the admin can do this")]
    Unauthorized,
    #[msg("Only the program's upgrade authority can initialize the protocol")]
    NotUpgradeAuthority,
    #[msg("New switches are paused")]
    ProtocolPaused,
    #[msg("Switch id must equal the owner's next switch id")]
    BadSwitchId,
    #[msg("This tier has reached its switch limit")]
    SwitchLimit,
    #[msg("Interval is not allowed for this tier")]
    BadInterval,
    #[msg("At least one heir is required")]
    NoHeirs,
    #[msg("Too many heirs for this tier")]
    TooManyHeirs,
    #[msg("Heir shares must add up to exactly 100%")]
    SharesNot100,
    #[msg("Every heir needs a share above zero")]
    ZeroShare,
    #[msg("An heir appears twice")]
    DuplicateHeir,
    #[msg("This address cannot be an heir")]
    InvalidHeir,
    #[msg("The switch can no longer be edited")]
    NotEditable,
    #[msg("The switch is not active")]
    NotActive,
    #[msg("The switch is not paused")]
    NotPaused,
    #[msg("The check-in deadline and grace period have not passed")]
    TooEarly,
    #[msg("Execution has not started")]
    NotTriggered,
    #[msg("Asset index out of range")]
    BadAssetIndex,
    #[msg("Heir index out of range")]
    BadHeirIndex,
    #[msg("This switch already holds the maximum number of assets")]
    TooManyAssets,
    #[msg("This token account is already part of the switch")]
    DuplicateAsset,
    #[msg("This token account is delegated to another program")]
    AlreadyDelegated,
    #[msg("This token account is frozen")]
    AccountFrozen,
    #[msg("Amount must be above zero")]
    ZeroAmount,
    #[msg("SOL amount is below the minimum")]
    SolBelowMinimum,
    #[msg("This switch already holds SOL; add to it instead")]
    SolAlreadyAdded,
    #[msg("Use the SOL instruction for native SOL")]
    UseSolInstruction,
    #[msg("NFTs need the Holder tier")]
    NftNeedsHolder,
    #[msg("An NFT must go to one named heir")]
    NftNeedsRecipient,
    #[msg("Letters need the Holder tier")]
    LettersNeedHolder,
    #[msg("Recipient is not one of the heirs")]
    BadRecipient,
    #[msg("This token's mint has an extension Perpetua cannot move safely")]
    UnsupportedMint,
    #[msg("Account does not match the switch")]
    AccountMismatch,
    #[msg("Wrong token program for this asset")]
    WrongTokenProgram,
    #[msg("The asset is not in the expected state")]
    BadAssetState,
    #[msg("This heir has already received their share")]
    AlreadyDelivered,
    #[msg("The asset can still be settled")]
    CannotSkipYet,
    #[msg("The $PERPETUA mint is already set")]
    MintAlreadySet,
    #[msg("Tier holding does not belong to the owner or is not $PERPETUA")]
    BadTierAccount,
    #[msg("One letter hash per heir is required")]
    LetterCountMismatch,
    #[msg("Remaining accounts do not match the switch assets")]
    RemainingAccountsMismatch,
    #[msg("The treasury must keep its minimum balance")]
    TreasuryMinimum,
    #[msg("Arithmetic overflow")]
    Overflow,
}
