import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { DAY, Env, ExtensionType, GRACE, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, heirs } from "./harness";

const fee = (x: bigint) => (x * 50n) / 10_000n;

describe("no early execution", () => {
  it("trigger fails until interval plus the 7-day grace has passed, to the second", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]), { intervalDays: 30 });
    const start = env.now;
    const trig = () => env.client.trigger(env.keeper.publicKey, sw, owner.publicKey);
    assert.equal(await env.sendErr([trig()], [env.keeper]), "TooEarly");
    env.setTime(start + 30 * DAY);
    assert.equal(await env.sendErr([trig()], [env.keeper]), "TooEarly", "at the deadline");
    env.setTime(start + 30 * DAY + GRACE - 1);
    assert.equal(await env.sendErr([trig()], [env.keeper]), "TooEarly", "one second before grace ends");
    env.setTime(start + 30 * DAY + GRACE);
    await env.sendOk([trig()], [env.keeper]);
    assert.equal(env.switchState(sw).status, 3, "no assets: executed at once");
    assert.equal(await env.sendErr([trig()], [env.keeper]), "NotActive", "cannot trigger twice");
  });

  it("a late check-in during grace (or after it, before anyone triggers) keeps the switch alive", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]), { intervalDays: 30 });
    env.advance(30 * DAY + GRACE + 3600);
    await env.sendOk([env.client.checkIn(owner.publicKey, sw)], [owner]);
    assert.equal(await env.sendErr([env.client.trigger(env.keeper.publicKey, sw, owner.publicKey)], [env.keeper]), "TooEarly");
  });

  it("an owner edit counts as a check-in", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const h = Keypair.generate().publicKey;
    const sw = await env.createSwitch(owner, heirs([h, 10_000]), { intervalDays: 30 });
    env.advance(29 * DAY);
    await env.sendOk([env.client.updateInterval(owner.publicKey, sw, 90 * DAY)], [owner]);
    env.advance(30 * DAY + GRACE);
    assert.equal(await env.sendErr([env.client.trigger(env.keeper.publicKey, sw, owner.publicKey)], [env.keeper]), "TooEarly");
  });

  it("nothing can be settled or delivered before trigger, and the owner cannot edit after it", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 1_000n);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 1_000n })], [owner]);
    const st = env.switchState(sw);
    assert.equal(await env.sendErr([env.client.settleAsset(env.keeper.publicKey, sw, st, 0)], [env.keeper]), "NotTriggered");
    assert.equal(await env.sendErr([env.client.skipAsset(env.keeper.publicKey, sw, st, 0)], [env.keeper]), "NotTriggered");
    env.advance(37 * DAY);
    await env.sendOk([env.client.trigger(env.keeper.publicKey, sw, owner.publicKey)], [env.keeper]);
    assert.equal(await env.sendErr([env.client.checkIn(owner.publicKey, sw)], [owner]), "NotActive");
    assert.equal(await env.sendErr([env.client.updateInterval(owner.publicKey, sw, 90 * DAY)], [owner]), "NotEditable");
    assert.equal(await env.sendErr([env.client.cancel(owner.publicKey, sw, env.switchState(sw))], [owner]), "NotEditable");
    assert.equal(await env.sendErr([env.client.removeAsset(owner.publicKey, sw, 0, ata)], [owner]), "NotEditable");
  });
});

describe("full execution", () => {
  it("delivers SOL, a token, a transfer-fee token and an NFT exactly by percentage", async () => {
    const env = await Env.create();
    const perp = await env.createMint();
    await env.sendOk([env.client.setPerpetuaMint(env.admin.publicKey, perp.mint)], [env.admin]);
    const owner = env.wallet(50);
    const tier = { holding: await env.mintTo(perp, owner.publicKey, 1_000_000_000_000n), mint: perp.mint };
    // Heirs have never been on chain: no SOL, no token accounts.
    const [mom, brother, sister] = [0, 1, 2].map(() => Keypair.generate().publicKey);
    const sw = await env.createSwitch(owner, heirs([mom, 5000], [brother, 3333], [sister, 1667]), { tier, intervalDays: 90 });

    const usdc = await env.createMint({ decimals: 6 });
    const usdcAta = await env.mintTo(usdc, owner.publicKey, 10_000_000_001n);
    const ft = await env.createMint({ decimals: 9, token2022: true, extensions: [ExtensionType.TransferFeeConfig], transferFeeBps: 100 });
    const ftAta = await env.mintTo(ft, owner.publicKey, 7_000_000_000n);
    const nft = await env.nft(owner.publicKey);
    const add = (p: { mint: PublicKey; tokenAccount: PublicKey; tokenProgram: PublicKey; amount: bigint; recipient?: number }) =>
      env.client.addTokenAsset({ owner: owner.publicKey, sw, tier, ...p });
    await env.sendOk([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 3_000_000_003n, tier })], [owner]);
    await env.sendOk([add({ mint: usdc.mint, tokenAccount: usdcAta, tokenProgram: TOKEN_PROGRAM_ID, amount: 10_000_000_001n })], [owner]);
    await env.sendOk([add({ mint: ft.mint, tokenAccount: ftAta, tokenProgram: TOKEN_2022_PROGRAM_ID, amount: 7_000_000_000n })], [owner]);
    await env.sendOk([add({ mint: nft.mint, tokenAccount: nft.ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 1n, recipient: 2 })], [owner]);

    env.advance(90 * DAY + GRACE);
    const treasury = env.client.pda.treasury();
    const t0 = env.lamports(treasury);
    const keeper0 = env.lamports(env.keeper.publicKey);
    const st = await env.execute(sw);
    assert.equal(st.status, 3);
    assert.ok(st.triggeredAt > 0 && st.executedAt >= st.triggeredAt);

    // SOL: 0.5% to the treasury, the rest split 50 / 33.33 / 16.67 with the remainder to the last heir.
    const solIn = 3_000_000_003n;
    const solNet = solIn - fee(solIn);
    assert.equal(BigInt(env.lamports(treasury) - t0), fee(solIn));
    const split = (net: bigint) => {
      const a = (net * 5000n) / 10_000n;
      const b = (net * 3333n) / 10_000n;
      return [a, b, net - a - b];
    };
    const [s0, s1, s2] = split(solNet);
    assert.equal(BigInt(env.lamports(mom)), s0);
    assert.equal(BigInt(env.lamports(brother)), s1);
    assert.equal(BigInt(env.lamports(sister)), s2);

    // USDC (classic SPL)
    const uNet = 10_000_000_001n - fee(10_000_000_001n);
    const [u0, u1, u2] = split(uNet);
    assert.equal(env.balance(env.ata(usdc.mint, mom)), u0);
    assert.equal(env.balance(env.ata(usdc.mint, brother)), u1);
    assert.equal(env.balance(env.ata(usdc.mint, sister)), u2);
    assert.equal(env.balance(env.ata(usdc.mint, treasury)), fee(10_000_000_001n));
    assert.equal(env.balance(usdcAta), 0n);
    assert.equal(env.exists(env.ata(usdc.mint, sw)), false, "empty escrow closed");

    // Token-2022 with a 1% transfer fee: what arrives in escrow is measured, not assumed.
    const fAsset = st.assets[2];
    const received = fAsset.escrowed + fAsset.fee;
    assert.equal(received, 7_000_000_000n - 70_000_000n);
    assert.equal(fAsset.fee, fee(received));

    // NFT goes whole to the named heir.
    assert.equal(env.balance(env.ata(nft.mint, sister)), 1n);
    assert.equal(env.balance(nft.ata), 0n);
    assert.equal(Number(st.assets[3].fee), 0);

    // The keeper paid heir account rent and network fees, nothing more.
    assert.ok(keeper0 - env.lamports(env.keeper.publicKey) < 0.05 * 1e9);
    assert.equal(env.config().executions, 1);
    assert.equal(env.config().switchesActive, 0);
  });

  it("delivers only what is left when the owner spent part of a delegated balance", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const heir = Keypair.generate().publicKey;
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 1_000_000n);
    const sw = await env.createSwitch(owner, heirs([heir, 10_000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 800_000n })], [owner]);
    await env.transferOut(owner, ata, m.mint, TOKEN_PROGRAM_ID, 700_000n);
    env.advance(37 * DAY);
    await env.execute(sw);
    assert.equal(env.balance(env.ata(m.mint, heir)), 300_000n - fee(300_000n));
  });

  it("delivers only the delegated amount when the owner holds more", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const heir = Keypair.generate().publicKey;
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 1_000_000n);
    const sw = await env.createSwitch(owner, heirs([heir, 10_000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 250_000n })], [owner]);
    env.advance(37 * DAY);
    await env.execute(sw);
    assert.equal(env.balance(env.ata(m.mint, heir)), 250_000n - fee(250_000n));
    assert.equal(env.balance(ata), 750_000n, "the rest stays in the owner's wallet");
  });

  it("skips assets whose delegation changed, whose account closed or froze, and still finishes", async () => {
    const env = await Env.create();
    const owner = env.wallet(20);
    const heir = env.wallet(1).publicKey;
    const a = await env.createMint();
    const b = await env.createMint();
    const c = await env.createMint({ freezeAuthority: true });
    const d = await env.createMint();
    const [aa, ba, ca, da] = [
      await env.mintTo(a, owner.publicKey, 100n),
      await env.mintTo(b, owner.publicKey, 100n),
      await env.mintTo(c, owner.publicKey, 100n),
      await env.mintTo(d, owner.publicKey, 100n),
    ];
    const sw = await env.createSwitch(owner, heirs([heir, 10_000]));
    for (const [m, acc] of [[a, aa], [b, ba], [c, ca], [d, da]] as const) {
      await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: acc, tokenProgram: TOKEN_PROGRAM_ID, amount: 100n })], [owner]);
    }
    await env.approveOther(owner, aa, TOKEN_PROGRAM_ID, 100n); // delegation moved elsewhere
    await env.transferOut(owner, ba, b.mint, TOKEN_PROGRAM_ID, 100n);
    await env.closeTokenAccount(owner, ba, TOKEN_PROGRAM_ID); // account closed
    await env.freeze(ca, c.mint, TOKEN_PROGRAM_ID); // frozen
    env.advance(37 * DAY);
    const st = await env.execute(sw);
    assert.equal(st.status, 3);
    assert.deepEqual(st.assets.map((x) => x.state), [3, 3, 3, 2]);
    assert.equal(env.balance(aa), 100n, "re-delegated tokens untouched");
    assert.equal(env.balance(ca), 100n, "frozen tokens untouched");
    assert.equal(env.balance(env.ata(d.mint, heir)), 100n);
  });

  it("execution steps reject substituted accounts", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const attacker = env.wallet();
    const [h0, h1] = [Keypair.generate().publicKey, Keypair.generate().publicKey];
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 1_000n);
    const attackerAta = await env.mintTo(m, attacker.publicKey, 1_000n);
    const sw = await env.createSwitch(owner, heirs([h0, 5000], [h1, 5000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 1_000n })], [owner]);
    env.advance(37 * DAY);
    await env.sendOk([env.client.trigger(attacker.publicKey, sw, owner.publicKey)], [attacker]);
    let st = env.switchState(sw);
    const forged = { ...st, assets: [{ ...st.assets[0], tokenAccount: attackerAta }] };
    assert.equal(await env.sendErr([env.client.settleAsset(attacker.publicKey, sw, forged, 0)], [attacker]), "AccountMismatch");
    await env.sendOk([env.client.settleAsset(attacker.publicKey, sw, st, 0)], [attacker]);
    st = env.switchState(sw);
    const redirected = { ...st, heirs: [{ ...st.heirs[0], wallet: attacker.publicKey }, st.heirs[1]] };
    assert.equal(await env.sendErr([env.client.deliver(attacker.publicKey, sw, redirected, 0, 0)], [attacker]), "AccountMismatch");
    await env.sendOk([env.client.deliver(attacker.publicKey, sw, st, 0, 0)], [attacker]);
    assert.equal(await env.sendErr([env.client.deliver(attacker.publicKey, sw, st, 0, 0)], [attacker]), "AlreadyDelivered");
    assert.equal(await env.sendErr([env.client.settleAsset(attacker.publicKey, sw, st, 0)], [attacker]), "BadAssetState");
    await env.sendOk([env.client.deliver(attacker.publicKey, sw, st, 0, 1)], [attacker]);
    assert.equal(env.switchState(sw).status, 3);
    assert.equal(env.balance(attackerAta), 1_000n, "the caller gained nothing");
  });

  it("a SOL share too small to open an empty wallet goes to the treasury instead of blocking", async () => {
    const env = await Env.create();
    const perp = await env.createMint();
    await env.sendOk([env.client.setPerpetuaMint(env.admin.publicKey, perp.mint)], [env.admin]);
    const owner = env.wallet(5);
    const tier = { holding: await env.mintTo(perp, owner.publicKey, 1_000_000_000_000n), mint: perp.mint };
    const big = env.wallet(0).publicKey;
    const tiny = Keypair.generate().publicKey;
    const sw = await env.createSwitch(owner, heirs([big, 9999], [tiny, 1]), { tier });
    await env.sendOk([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 10_000_000n, tier })], [owner]);
    env.advance(37 * DAY);
    const t0 = env.lamports(env.client.pda.treasury());
    await env.execute(sw);
    const net = 10_000_000n - fee(10_000_000n);
    const bigShare = (net * 9999n) / 10_000n;
    assert.equal(BigInt(env.lamports(big)), bigShare);
    assert.equal(env.lamports(tiny), 0);
    assert.equal(BigInt(env.lamports(env.client.pda.treasury()) - t0), fee(10_000_000n) + (net - bigShare));
  });

  it("a pending asset can be skipped only when provably unavailable or after 30 days", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const heir = Keypair.generate().publicKey;
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 100n);
    const sw = await env.createSwitch(owner, heirs([heir, 10_000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 100n })], [owner]);
    env.advance(37 * DAY);
    await env.sendOk([env.client.trigger(env.keeper.publicKey, sw, owner.publicKey)], [env.keeper]);
    const st = env.switchState(sw);
    assert.equal(await env.sendErr([env.client.skipAsset(env.keeper.publicKey, sw, st, 0)], [env.keeper]), "CannotSkipYet");
    env.advance(30 * DAY);
    await env.sendOk([env.client.skipAsset(env.keeper.publicKey, sw, st, 0)], [env.keeper]);
    assert.equal(env.switchState(sw).status, 3);
  });
});

describe("treasury", () => {
  it("only the engine can sweep, and the treasury keeps its minimum", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    const stranger = env.wallet();
    assert.equal(await env.sendErr([env.client.sweepSol(stranger.publicKey, 1_000n)], [stranger]), "Unauthorized");
    const e0 = env.lamports(env.engine.publicKey);
    await env.sendOk([env.client.sweepSol(env.engine.publicKey, 50_000_000n)], [env.engine]);
    assert.equal(env.lamports(env.engine.publicKey) - e0, 50_000_000 - 5000);
    assert.equal(await env.sendErr([env.client.sweepSol(env.engine.publicKey, 1n)], [env.engine]), "TreasuryMinimum");
  });

  it("token fees can be swept to the engine for buyback", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 1_000_000n);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 1_000_000n })], [owner]);
    env.advance(37 * DAY);
    await env.execute(sw);
    const engineAta = await env.mintTo(m, env.engine.publicKey, 0n);
    await env.sendOk([env.client.sweepToken(env.engine.publicKey, m.mint, TOKEN_PROGRAM_ID, 5_000n)], [env.engine]);
    assert.equal(env.balance(engineAta), 5_000n);
  });
});
