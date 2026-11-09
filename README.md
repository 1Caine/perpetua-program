# Perpetua program

Perpetua is onchain inheritance on Solana. An owner sets up a switch: heirs with a share each, the assets to pass on, and a check-in interval. While the owner keeps checking in, nothing happens and every asset stays in the owner's wallet. If the owner stops checking in, a grace period begins, and after it anyone can execute the switch, which delivers the assets to the heirs by their shares.

This repository holds the Solana program only. The website lives at [perpetuaprotocol.xyz](https://perpetuaprotocol.xyz).

## Program addresses

| Cluster | Address |
| --- | --- |
| Mainnet | `PerpX2pWbVffrbJfb4zbDtGkJeWGyucH2HVPkvdpDit` |
| Devnet | `PerpfW46kjYYhYcPzNxnyuTrsWBSNXax953aPrd3FCo` |

The devnet build uses the `devnet` and `short-timers` features, where one day of the schedule lasts one second so the full lifecycle can be tested quickly. The mainnet build uses no features.

## How it works

- **Non-custodial.** Tokens and NFTs stay in the owner's token accounts. The owner approves the switch account as a delegate for a set amount. SOL is held as wrapped SOL in a reserve account owned by the owner and delegated the same way.
- **Check-in.** A check-in is a single instruction from the owner that resets the timer. Intervals are 30, 90, 180 or 365 days, with a 7-day grace period after the deadline.
- **Edit, pause or cancel.** The owner can change heirs, interval and assets at any time. Cancelling revokes every approval and returns the reserve.
- **Execution.** Once the grace period ends, execution is permissionless. Each asset is settled into an escrow account of the switch, the execution fee is taken, and each heir receives their share. Heir token accounts are created when needed. Assets that can no longer be delivered, for example because an approval was revoked, are skipped.
- **Letters.** Each heir entry can carry the hash of an encrypted letter envelope stored off chain. The program records the hash; it never sees the letter.
- **Fees and tiers.** Setup is 0.05 SOL on the Free tier, check-ins are free, and execution takes 0.5% of delivered assets into the treasury account. Holding $PERPETUA unlocks the Holder and Patron tiers.

Every limit lives in `programs/perpetua/src/constants.rs`.

## Build

Requires Rust and the Solana CLI (Agave 4.2.2).

```bash
cargo build-sbf --manifest-path programs/perpetua/Cargo.toml
```

## Verify the deployed program

The verifiable build runs in the pinned Docker image that [solana-verify](https://github.com/Ellipsis-Labs/solana-verifiable-build) selects from `[workspace.metadata.cli]` in `Cargo.toml`.

```bash
cargo install solana-verify
solana-verify build --library-name perpetua
solana-verify get-executable-hash target/deploy/perpetua.so
solana-verify get-program-hash -u mainnet PerpX2pWbVffrbJfb4zbDtGkJeWGyucH2HVPkvdpDit

# or build from this repository and compare with the onchain program in one step
solana-verify verify-from-repo -u mainnet \
  --program-id PerpX2pWbVffrbJfb4zbDtGkJeWGyucH2HVPkvdpDit \
  --library-name perpetua \
  https://github.com/perpetuaxyz/perpetua-program
```

The two hashes match when the onchain program was built from this source. The `verify` workflow publishes the hash of every build on `main` in its run summary.

## Tests

```bash
npm ci
cargo build-sbf --manifest-path programs/perpetua/Cargo.toml
npm test            # unit and integration tests on LiteSVM, plus the mainnet-fork rehearsal
npm run fuzz        # stateful fuzzer (FUZZ_SEED, FUZZ_SEQ, FUZZ_SUBST)
scripts/fuzz-campaign.sh <seed> <sequences>   # long campaigns in batches
```

The mainnet-fork rehearsal runs the program against the real mainnet Token, Token-2022 and Associated Token Account programs and real mints (USDC, a pump.fun coin, PYUSD), loaded from `tests/fixtures/mainnet`. Refresh them with `node scripts/fetch-mainnet-fixtures.mjs [rpcUrl]`.

The `client/` folder holds the TypeScript client and IDL the tests use.

## Security

See [SECURITY.md](SECURITY.md). The program embeds a `security.txt` readable with `solana-verify` or `query-security-txt`.
