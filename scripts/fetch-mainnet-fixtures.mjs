// Snapshots real mainnet accounts for the fork rehearsal (program/tests/fork.test.ts).
// Re-run to refresh: node scripts/fetch-mainnet-fixtures.mjs [rpcUrl]
import { mkdirSync, writeFileSync } from "node:fs";
const RPC = process.argv[2] ?? process.env.MAINNET_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const out = new URL("../tests/fixtures/mainnet/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const ACCOUNTS = {
  "token-program": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "token-2022-program": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ata-program": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "usdc-mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "native-mint": "So11111111111111111111111111111111111111112",
  "pump-coin-mint": "27hRNc7414SXMj6sAnk7AffMkyAuC3f95SATNUjzpump",
  "pyusd-mint": "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
};
async function get(address) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [address, { encoding: "base64" }] }),
  });
  const j = await r.json();
  if (!j.result?.value) throw new Error(`missing ${address}: ${JSON.stringify(j.error ?? j)}`);
  return { address, slot: j.result.context.slot, ...j.result.value, data: j.result.value.data[0] };
}
for (const [name, address] of Object.entries(ACCOUNTS)) {
  const acc = await get(address);
  writeFileSync(out + name + ".json", JSON.stringify(acc));
  console.log(name, address, "owner", acc.owner, "bytes", Buffer.from(acc.data, "base64").length);
  // Upgradeable programs keep their code in a separate ProgramData account.
  if (acc.owner === "BPFLoaderUpgradeab1e11111111111111111111111") {
    const pd = Buffer.from(acc.data, "base64").subarray(4, 36);
    const { PublicKey } = await import("@solana/web3.js");
    const pdAcc = await get(new PublicKey(pd).toBase58());
    writeFileSync(out + name + "-data.json", JSON.stringify(pdAcc));
    console.log("  programdata bytes", Buffer.from(pdAcc.data, "base64").length);
  }
  await new Promise((r) => setTimeout(r, 400));
}
