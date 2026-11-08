# Security

Please report vulnerabilities privately by email to support@perpetuaprotocol.xyz. Include the steps to reproduce, the affected instruction, and any transactions or accounts involved. Give us reasonable time to fix the issue before disclosing it publicly.

The disclosure policy is at https://perpetuaprotocol.xyz/.well-known/security.txt and the current audit status is on https://perpetuaprotocol.xyz/security.

## Scope

- The Perpetua program in this repository, at the addresses listed in the README.
- Anything that lets someone other than the owner move, redirect or freeze assets, execute a switch before its time, or take more than the published fees.

## Upgrade authority

From the mainnet launch, the program's upgrade authority is a 2-of-3 Squads multisig. The current authority is always visible onchain with `solana program show PerpX2pWbVffrbJfb4zbDtGkJeWGyucH2HVPkvdpDit`.
