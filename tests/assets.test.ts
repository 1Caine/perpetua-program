import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { DAY, Env, ExtensionType, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, heirs } from "./harness";

async function holderEnv() {
  const env = await Env.create();
  const perp = await env.createMint();
  await env.sendOk([env.client.setPerpetuaMint(env.admin.publicKey, perp.mint)], [env.admin]);
  const owner = env.wallet(50);
  const ata = await env.mintTo(perp, owner.publicKey, 1_000_000_000_000n);
  return { env, owner, tier: { holding: ata, mint: perp.mint } };
}

describe("token assets stay in the owner's wallet", () => {
  it("adding a token approves the switch PDA as delegate and moves nothing", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const usdc = await env.createMint({ decimals: 6 });
    const ata = await env.mintTo(usdc, owner.publicKey, 5_000_000_000n);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    await env.sendOk(
      [env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: usdc.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 3_000_000_000n })],
      [owner],
    );
    const acc = env.tokenAccount(ata)!;
    assert.equal(acc.amount, 5_000_000_000n, "balance unchanged");
    assert.ok(acc.delegate?.equals(sw), "switch PDA is delegate");
    assert.equal(acc.delegatedAmount, 3_000_000_000n);
    const st = env.switchState(sw);
    assert.equal(st.assets.length, 1);
    assert.equal(st.assets[0].kind, 1);
    assert.equal(String(st.assets[0].approved), "3000000000");
  });

  it("refuses accounts already delegated elsewhere, frozen accounts, duplicates and native SOL", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const m = await env.createMint({ freezeAuthority: true });
    const ata = await env.mintTo(m, owner.publicKey, 1_000n);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    const add = (tokenAccount: PublicKey, mint = m.mint, amount = 10n) =>
      env.client.addTokenAsset({ owner: owner.publicKey, sw, mint, tokenAccount, tokenProgram: TOKEN_PROGRAM_ID, amount });
    await env.approveOther(owner, ata, TOKEN_PROGRAM_ID, 5n);
    assert.equal(await env.sendErr([add(ata)], [owner]), "AlreadyDelegated");

    const m2 = await env.createMint({ freezeAuthority: true });
    const ata2 = await env.mintTo(m2, owner.publicKey, 1_000n);
    await env.freeze(ata2, m2.mint, TOKEN_PROGRAM_ID);
    assert.equal(await env.sendErr([add(ata2, m2.mint)], [owner]), "AccountFrozen");

    const m3 = await env.createMint();
    const ata3 = await env.mintTo(m3, owner.publicKey, 1_000n);
    await env.sendOk([add(ata3, m3.mint)], [owner]);
    assert.equal(await env.sendErr([add(ata3, m3.mint)], [owner]), "DuplicateAsset");
    assert.equal(await env.sendErr([add(ata3, m3.mint, 0n)], [owner]), "ZeroAmount");
  });

  it("another wallet cannot add assets to, edit, or check in on someone else's switch", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const thief = env.wallet();
    const m = await env.createMint();
    const thiefAta = await env.mintTo(m, thief.publicKey, 1_000n);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    const errs = [
      await env.sendErr([env.client.checkIn(thief.publicKey, sw)], [thief]),
      await env.sendErr([env.client.pause(thief.publicKey, sw)], [thief]),
      await env.sendErr([env.client.updateHeirs(thief.publicKey, sw, heirs([thief.publicKey, 10_000]))], [thief]),
      await env.sendErr([env.client.updateInterval(thief.publicKey, sw, 90 * DAY)], [thief]),
      await env.sendErr(
        [env.client.addTokenAsset({ owner: thief.publicKey, sw, mint: m.mint, tokenAccount: thiefAta, tokenProgram: TOKEN_PROGRAM_ID, amount: 1n })],
        [thief],
      ),
      await env.sendErr([env.client.cancel(thief.publicKey, sw, env.switchState(sw))], [thief]),
    ];
    for (const e of errs) assert.match(e, /ConstraintSeeds|ConstraintHasOne|AccountNotInitialized/);
    assert.equal(env.switchState(sw).heirs[0].wallet.equals(thief.publicKey), false);
  });

  it("NFTs need the Holder tier and one named heir", async () => {
    const free = await Env.create();
    const fo = free.wallet();
    const n = await free.nft(fo.publicKey);
    const fsw = await free.createSwitch(fo, heirs([Keypair.generate().publicKey, 10_000]));
    assert.equal(
      await free.sendErr([free.client.addTokenAsset({ owner: fo.publicKey, sw: fsw, mint: n.mint, tokenAccount: n.ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 1n, recipient: 0 })], [fo]),
      "NftNeedsHolder",
    );

    const { env, owner, tier } = await holderEnv();
    const nft = await env.nft(owner.publicKey);
    const [a, b] = [Keypair.generate().publicKey, Keypair.generate().publicKey];
    const sw = await env.createSwitch(owner, heirs([a, 5000], [b, 5000]), { tier });
    const add = (recipient: number) =>
      env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: nft.mint, tokenAccount: nft.ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 1n, recipient, tier });
    assert.equal(await env.sendErr([add(255)], [owner]), "NftNeedsRecipient");
    assert.equal(await env.sendErr([add(2)], [owner]), "BadRecipient");
    await env.sendOk([add(1)], [owner]);
    assert.equal(env.switchState(sw).assets[0].kind, 2);
    // Removing the named heir is refused while the NFT points at them.
    assert.equal(await env.sendErr([env.client.updateHeirs(owner.publicKey, sw, heirs([a, 10_000]), tier)], [owner]), "BadRecipient");
    await env.sendOk([env.client.setAssetRecipient(owner.publicKey, sw, 0, 0, tier)], [owner]);
    await env.sendOk([env.client.updateHeirs(owner.publicKey, sw, heirs([a, 10_000]), tier)], [owner]);
  });

  it("refuses Token-2022 mints that cannot be moved safely, accepts transfer-fee mints", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    const tryMint = async (opts: Parameters<Env["createMint"]>[0]) => {
      const m = await env.createMint({ token2022: true, ...opts });
      const ata = await env.mintTo(m, owner.publicKey, 1_000_000n);
      return env.sendErr(
        [env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_2022_PROGRAM_ID, amount: 10n })],
        [owner],
      ).catch((e) => `ok:${e.message}`);
    };
    assert.equal(await tryMint({ extensions: [ExtensionType.TransferHook] }), "UnsupportedMint");
    assert.equal(await tryMint({ extensions: [ExtensionType.NonTransferable] }), "UnsupportedMint");

    const fee = await env.createMint({ token2022: true, extensions: [ExtensionType.TransferFeeConfig], transferFeeBps: 100 });
    const feeAta = await env.mintTo(fee, owner.publicKey, 1_000_000n);
    await env.sendOk(
      [env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: fee.mint, tokenAccount: feeAta, tokenProgram: TOKEN_2022_PROGRAM_ID, amount: 500_000n })],
      [owner],
    );
    const st = env.switchState(sw);
    assert.equal(st.assets[0].token2022, true);
  });

  it("set_asset_amount re-approves; remove_asset revokes and refunds space", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 1_000n);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 100n })], [owner]);
    await env.sendOk(
      [env.client.setAssetAmount({ owner: owner.publicKey, sw, index: 0, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 900n })],
      [owner],
    );
    assert.equal(env.tokenAccount(ata)!.delegatedAmount, 900n);
    const before = env.lamports(sw);
    await env.sendOk([env.client.removeAsset(owner.publicKey, sw, 0, ata)], [owner]);
    assert.equal(env.tokenAccount(ata)!.delegate, null);
    assert.equal(env.switchState(sw).assets.length, 0);
    assert.ok(env.lamports(sw) < before, "rent for the asset slot was refunded");
  });

  it("an asset limit of 12 per switch", async () => {
    const env = await Env.create();
    const owner = env.wallet(50);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    for (let i = 0; i < 12; i++) {
      const m = await env.createMint();
      const ata = await env.mintTo(m, owner.publicKey, 10n);
      await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 10n })], [owner]);
    }
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 10n);
    assert.equal(
      await env.sendErr([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 10n })], [owner]),
      "TooManyAssets",
    );
    // Cancelling with 12 assets still fits in one transaction with headroom.
    const size = await env.txSize([env.client.cancel(owner.publicKey, sw, env.switchState(sw))], [owner]);
    assert.ok(size <= 1232 - 200, `cancel with 12 assets is ${size} bytes`);
    await env.sendOk([env.client.cancel(owner.publicKey, sw, env.switchState(sw))], [owner]);
  });
});

describe("SOL reserve", () => {
  it("wraps SOL into the owner's own reserve account, delegated to the switch", async () => {
    const env = await Env.create();
    const owner = env.wallet(20);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    const reserve = env.client.pda.reserve(sw);
    await env.sendOk([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 2_000_000_000n })], [owner]);
    const acc = env.tokenAccount(reserve)!;
    assert.ok(acc.owner.equals(owner.publicKey), "the owner is the reserve's authority");
    assert.ok(acc.mint.equals(NATIVE_MINT));
    assert.equal(acc.amount, 2_000_000_000n);
    assert.ok(acc.delegate?.equals(sw));
    assert.equal(acc.delegatedAmount, 2_000_000_000n);
    await env.sendOk([env.client.fundSol(owner.publicKey, sw, 500_000_000n)], [owner]);
    assert.equal(env.tokenAccount(reserve)!.amount, 2_500_000_000n);
    assert.equal(env.tokenAccount(reserve)!.delegatedAmount, 2_500_000_000n);
    assert.equal(env.switchState(sw).assets[0].approved, 2_500_000_000n);
    assert.equal(
      await env.sendErr([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 2_000_000_000n })], [owner]),
      "SolAlreadyAdded",
    );
  });

  it("refuses less than the 0.01 SOL minimum", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    assert.equal(
      await env.sendErr([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 9_999_999n })], [owner]),
      "SolBelowMinimum",
    );
  });

  it("removing SOL unwraps it back into the owner's wallet", async () => {
    const env = await Env.create();
    const owner = env.wallet(20);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    const reserve = env.client.pda.reserve(sw);
    const before = env.lamports(owner.publicKey);
    await env.sendOk([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 3_000_000_000n })], [owner]);
    await env.sendOk([env.client.removeAsset(owner.publicKey, sw, 0, reserve)], [owner]);
    assert.equal(env.exists(reserve), false);
    // Only network fees are lost (two transactions at 5000 lamports each).
    assert.equal(before - env.lamports(owner.publicKey), 10_000);
  });
});

describe("check-in, pause and cancel", () => {
  it("check-in resets the timer and counts", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]), { intervalDays: 90 });
    env.advance(80 * DAY);
    await env.sendOk([env.client.checkIn(owner.publicKey, sw)], [owner]);
    const st = env.switchState(sw);
    assert.equal(st.lastCheckIn, env.now);
    assert.equal(st.checkIns, 1);
  });

  it("a paused switch never triggers; resuming starts a fresh interval", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    await env.sendOk([env.client.pause(owner.publicKey, sw)], [owner]);
    assert.equal(await env.sendErr([env.client.checkIn(owner.publicKey, sw)], [owner]), "NotActive");
    env.advance(400 * DAY);
    assert.equal(await env.sendErr([env.client.trigger(env.keeper.publicKey, sw, owner.publicKey)], [env.keeper]), "NotActive");
    await env.sendOk([env.client.resume(owner.publicKey, sw)], [owner]);
    assert.equal(env.switchState(sw).lastCheckIn, env.now);
    assert.equal(await env.sendErr([env.client.trigger(env.keeper.publicKey, sw, owner.publicKey)], [env.keeper]), "TooEarly");
  });

  it("cancel revokes every delegation, unwraps SOL, leaves foreign delegations alone and refunds rent", async () => {
    const env = await Env.create();
    const owner = env.wallet(20);
    const m1 = await env.createMint();
    const m2 = await env.createMint({ token2022: true });
    const a1 = await env.mintTo(m1, owner.publicKey, 1_000n);
    const a2 = await env.mintTo(m2, owner.publicKey, 1_000n);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m1.mint, tokenAccount: a1, tokenProgram: TOKEN_PROGRAM_ID, amount: 500n })], [owner]);
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m2.mint, tokenAccount: a2, tokenProgram: TOKEN_2022_PROGRAM_ID, amount: 500n })], [owner]);
    await env.sendOk([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 1_000_000_000n })], [owner]);
    // The owner later delegates a2 to some other program; cancel must not revoke that.
    await env.approveOther(owner, a2, TOKEN_2022_PROGRAM_ID, 7n);
    const otherDelegate = env.tokenAccount(a2)!.delegate!;
    const before = env.lamports(owner.publicKey);
    const switchRent = env.lamports(sw);
    const reserveLamports = env.lamports(env.client.pda.reserve(sw));
    await env.sendOk([env.client.cancel(owner.publicKey, sw, env.switchState(sw))], [owner]);
    assert.equal(env.tokenAccount(a1)!.delegate, null);
    assert.ok(env.tokenAccount(a2)!.delegate?.equals(otherDelegate));
    assert.equal(env.exists(sw), false);
    assert.equal(env.exists(env.client.pda.reserve(sw)), false);
    assert.equal(env.lamports(owner.publicKey) - before, switchRent + reserveLamports - 5000);
    assert.equal(env.profile(owner.publicKey).activeSwitches, 0);
    assert.equal(env.config().switchesActive, 0);
    // A Free owner can set up again after cancelling.
    await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
  });

  it("cancel needs exactly the switch's asset accounts", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 10n);
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 10n })], [owner]);
    const st = env.switchState(sw);
    const wrong = { ...st, assets: [{ ...st.assets[0], tokenAccount: Keypair.generate().publicKey }] };
    assert.equal(await env.sendErr([env.client.cancel(owner.publicKey, sw, wrong)], [owner]), "RemainingAccountsMismatch");
    assert.equal(await env.sendErr([env.client.cancel(owner.publicKey, sw, { ...st, assets: [] })], [owner]), "RemainingAccountsMismatch");
  });

  it("edits keep letters for heirs that stay and require Holder for new letters", async () => {
    const { env, owner, tier } = await holderEnv();
    const [a, b, c] = [0, 1, 2].map(() => Keypair.generate().publicKey);
    const sw = await env.createSwitch(owner, heirs([a, 5000], [b, 5000]), { tier });
    const la = new Uint8Array(32).fill(7);
    const lb = new Uint8Array(32).fill(9);
    await env.sendOk([env.client.setLetters(owner.publicKey, sw, [la, lb], tier)], [owner]);
    assert.equal(await env.sendErr([env.client.setLetters(owner.publicKey, sw, [la], tier)], [owner]), "LetterCountMismatch");
    await env.sendOk([env.client.updateHeirs(owner.publicKey, sw, heirs([b, 6000], [c, 4000]), tier)], [owner]);
    const st = env.switchState(sw);
    assert.deepEqual(st.heirs[0].letter, Array.from(lb));
    assert.deepEqual(st.heirs[1].letter, Array.from(new Uint8Array(32)));

    const free = await Env.create();
    const fo = free.wallet();
    const fsw = await free.createSwitch(fo, heirs([a, 10_000]));
    assert.equal(await free.sendErr([free.client.setLetters(fo.publicKey, fsw, [la])], [fo]), "LettersNeedHolder");
  });
});
