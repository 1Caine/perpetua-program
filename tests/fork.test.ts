// Mainnet-fork rehearsal: the real mainnet Token, Token-2022 and Associated Token
// program binaries and real mint accounts (USDC, wSOL, a live pump.fun Token-2022 coin,
// PYUSD) are loaded into the VM, then the whole lifecycle runs against them.
// Fixtures: node program/scripts/fetch-mainnet-fixtures.mjs
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { DAY, Env, GRACE, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, heirs } from "./harness";

const FIX = new URL("./fixtures/mainnet/", import.meta.url).pathname;
type Fixture = { address: string; owner: string; lamports: number; executable: boolean; data: string; slot: number };
const fx = (name: string): Fixture => JSON.parse(readFileSync(FIX + name + ".json", "utf8"));
const elfOf = (name: string) => {
  const f = fx(name);
  const raw = Buffer.from(f.data, "base64");
  if (f.owner === "BPFLoaderUpgradeab1e11111111111111111111111") {
    return Buffer.from(fx(name + "-data").data, "base64").subarray(45);
  }
  return raw;
};

const USDC = new PublicKey(fx("usdc-mint").address);
const PUMP = new PublicKey(fx("pump-coin-mint").address);
const PYUSD = new PublicKey(fx("pyusd-mint").address);
const report: Record<string, unknown> = { forkedFromSlot: fx("usdc-mint").slot, instructions: {} as Record<string, unknown> };

async function forkEnv() {
  const env = await Env.create();
  env.svm.addProgram(TOKEN_PROGRAM_ID, elfOf("token-program"));
  env.svm.addProgram(TOKEN_2022_PROGRAM_ID, elfOf("token-2022-program"));
  env.svm.addProgram(new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), elfOf("ata-program"));
  for (const name of ["usdc-mint", "native-mint", "pump-coin-mint", "pyusd-mint"]) {
    const f = fx(name);
    env.svm.setAccount(new PublicKey(f.address), {
      lamports: f.lamports,
      data: Buffer.from(f.data, "base64"),
      owner: new PublicKey(f.owner),
      executable: false,
    });
  }
  return env;
}

/** Opens the owner's real ATA through the real ATA program, then writes a balance into it. */
async function fund(env: Env, owner: Keypair, mint: PublicKey, programId: PublicKey, amount: bigint) {
  const ata = env.ata(mint, owner.publicKey, programId);
  await env.sendOk([createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, ata, owner.publicKey, mint, programId)], [owner]);
  const acc = env.svm.getAccount(ata)!;
  const data = Buffer.from(acc.data);
  data.writeBigUInt64LE(amount, 64);
  env.svm.setAccount(ata, { ...acc, data });
  return ata;
}

async function measured(env: Env, label: string, ixs: Parameters<Env["send"]>[0], signers: Keypair[]) {
  const size = await env.txSize(ixs, signers);
  const meta = await env.sendOk(ixs, signers);
  (report.instructions as Record<string, unknown>)[label] = { computeUnits: Number(meta.computeUnitsConsumed()), txBytes: size };
  return meta;
}

describe("mainnet-fork rehearsal", () => {
  after(() => {
    mkdirSync(new URL("../test-results/", import.meta.url), { recursive: true });
    writeFileSync(new URL("../test-results/fork-rehearsal.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
  });

  it("runs the full lifecycle on real mainnet programs and mints", async () => {
    const env = await forkEnv();
    const owner = env.wallet(20);
    const existingHeir = env.wallet(1).publicKey;
    const freshHeir = Keypair.generate().publicKey;
    const usdcAta = await fund(env, owner, USDC, TOKEN_PROGRAM_ID, 1_234_567_891n);
    const pumpAta = await fund(env, owner, PUMP, TOKEN_2022_PROGRAM_ID, 987_654_321_000n);
    const pyusdAta = await fund(env, owner, PYUSD, TOKEN_2022_PROGRAM_ID, 50_000_000n);

    const id = 0;
    const sw = env.client.pda.switch(owner.publicKey, id);
    await measured(env, "create_switch (2 heirs)", [env.client.createSwitch({ owner: owner.publicKey, id, intervalSecs: 90 * DAY, heirs: heirs([existingHeir, 6000], [freshHeir, 4000]) })], [owner]);
    await measured(env, "add_token_asset (USDC, SPL Token)", [env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: USDC, tokenAccount: usdcAta, tokenProgram: TOKEN_PROGRAM_ID, amount: 1_234_567_891n })], [owner]);
    await measured(env, "add_token_asset (pump.fun coin, Token-2022)", [env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: PUMP, tokenAccount: pumpAta, tokenProgram: TOKEN_2022_PROGRAM_ID, amount: 987_654_321_000n })], [owner]);
    await measured(env, "add_sol_asset", [env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 1_500_000_000n })], [owner]);
    // PYUSD carries confidential-transfer extensions: refused up front, before any delegation.
    assert.equal(
      await env.sendErr([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: PYUSD, tokenAccount: pyusdAta, tokenProgram: TOKEN_2022_PROGRAM_ID, amount: 1n })], [owner]),
      "UnsupportedMint",
    );
    assert.equal(env.tokenAccount(pyusdAta)!.delegate, null);

    env.advance(60 * DAY);
    await measured(env, "check_in", [env.client.checkIn(owner.publicKey, sw)], [owner]);
    assert.equal(env.balance(usdcAta), 1_234_567_891n, "nothing moved while the owner is here");

    env.advance(90 * DAY + GRACE);
    const keeper = env.keeper;
    const steps = [];
    for (let i = 0; i < 32; i++) {
      const st = env.switchState(sw);
      const next = await env.client.nextExecutionSteps(keeper.publicKey, sw, st, env.now);
      if (!next.length) break;
      await measured(env, `keeper: ${next[0].label.replace(/\d+/g, "n")}${next[0].label.startsWith("deliver") ? (st.assets[Number(next[0].label.split(" ")[1].split(":")[0])].kind === 0 ? " (SOL)" : " (token)") : ""}`, [next[0].ix], [keeper]);
      steps.push(next[0].label);
    }
    const st = env.switchState(sw);
    assert.equal(st.status, 3);
    report.keeperSteps = steps;

    const net = (x: bigint) => x - (x * 50n) / 10_000n;
    const sixty = (x: bigint) => (net(x) * 6000n) / 10_000n;
    for (const [mint, prog, gross] of [
      [USDC, TOKEN_PROGRAM_ID, 1_234_567_891n],
      [PUMP, TOKEN_2022_PROGRAM_ID, 987_654_321_000n],
    ] as const) {
      const a = env.balance(env.ata(mint, existingHeir, prog));
      const b = env.balance(env.ata(mint, freshHeir, prog));
      assert.equal(a, sixty(gross));
      assert.equal(a + b, net(gross));
    }
    assert.equal(BigInt(env.lamports(freshHeir)), net(1_500_000_000n) - sixty(1_500_000_000n));
    report.result = "executed: USDC, pump.fun Token-2022 coin and SOL delivered 60/40 after 0.5% fee; PYUSD refused";
  });

  it("cancel on real programs revokes every delegation and unwraps SOL", async () => {
    const env = await forkEnv();
    const owner = env.wallet(20);
    const usdcAta = await fund(env, owner, USDC, TOKEN_PROGRAM_ID, 5_000_000n);
    const pumpAta = await fund(env, owner, PUMP, TOKEN_2022_PROGRAM_ID, 5_000_000n);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: USDC, tokenAccount: usdcAta, tokenProgram: TOKEN_PROGRAM_ID, amount: 5_000_000n })], [owner]);
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: PUMP, tokenAccount: pumpAta, tokenProgram: TOKEN_2022_PROGRAM_ID, amount: 5_000_000n })], [owner]);
    await env.sendOk([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 1_000_000_000n })], [owner]);
    await measured(env, "cancel (3 assets)", [env.client.cancel(owner.publicKey, sw, env.switchState(sw))], [owner]);
    assert.equal(env.tokenAccount(usdcAta)!.delegate, null);
    assert.equal(env.tokenAccount(pumpAta)!.delegate, null);
    assert.equal(env.exists(sw), false);
  });
});
