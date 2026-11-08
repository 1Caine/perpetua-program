import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Keypair } from "@solana/web3.js";
import { DAY, Env, SETUP_FEE, heirs } from "./harness";

describe("protocol setup", () => {
  it("only the upgrade authority can initialize, and only once", async () => {
    const env = await Env.create({ initialize: false });
    const stranger = env.wallet();
    assert.equal(
      await env.sendErr([env.client.initialize(stranger.publicKey, stranger.publicKey)], [stranger]),
      "NotUpgradeAuthority",
    );
    await env.sendOk([env.client.initialize(env.admin.publicKey, env.engine.publicKey)], [env.admin]);
    const cfg = env.config();
    assert.ok(cfg.admin.equals(env.admin.publicKey));
    assert.ok(cfg.engine.equals(env.engine.publicKey));
    assert.equal(cfg.paused, false);
    // Treasury starts funded at its rent-exempt minimum.
    assert.equal(env.lamports(env.client.pda.treasury()), 890_880);
    const again = await env.sendErr([env.client.initialize(env.admin.publicKey, env.engine.publicKey)], [env.admin]);
    assert.match(again, /already in use|custom 0/);
  });

  it("admin powers are limited to the admin", async () => {
    const env = await Env.create();
    const stranger = env.wallet();
    assert.equal(await env.sendErr([env.client.setPaused(stranger.publicKey, true)], [stranger]), "Unauthorized");
    assert.equal(await env.sendErr([env.client.setEngine(stranger.publicKey, stranger.publicKey)], [stranger]), "Unauthorized");
    assert.equal(await env.sendErr([env.client.setAdmin(stranger.publicKey, stranger.publicKey)], [stranger]), "Unauthorized");
    const m = await env.createMint();
    assert.equal(await env.sendErr([env.client.setPerpetuaMint(stranger.publicKey, m.mint)], [stranger]), "Unauthorized");
  });

  it("the $PERPETUA mint can be set exactly once", async () => {
    const env = await Env.create();
    const a = await env.createMint();
    const b = await env.createMint();
    await env.sendOk([env.client.setPerpetuaMint(env.admin.publicKey, a.mint)], [env.admin]);
    assert.equal(await env.sendErr([env.client.setPerpetuaMint(env.admin.publicKey, b.mint)], [env.admin]), "MintAlreadySet");
    assert.ok(env.config().perpetuaMint.equals(a.mint));
  });

  it("pausing blocks only new switches", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const heir = Keypair.generate().publicKey;
    const sw = await env.createSwitch(owner, heirs([heir, 10_000]));
    await env.sendOk([env.client.setPaused(env.admin.publicKey, true)], [env.admin]);
    const other = env.wallet();
    const err = await env.sendErr(
      [env.client.createSwitch({ owner: other.publicKey, id: 0, intervalSecs: 30 * DAY, heirs: heirs([heir, 10_000]) })],
      [other],
    );
    assert.equal(err, "ProtocolPaused");
    // The existing owner can still check in, and the switch can still execute.
    await env.sendOk([env.client.checkIn(owner.publicKey, sw)], [owner]);
    env.advance(30 * DAY + 7 * DAY);
    const st = await env.execute(sw);
    assert.equal(st.status, 3);
  });
});

describe("tiers and switch creation", () => {
  it("Free tier pays the 0.05 SOL setup fee into the treasury PDA", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const t0 = env.lamports(env.client.pda.treasury());
    const sw = await env.createSwitch(owner, heirs([Keypair.generate().publicKey, 10_000]));
    assert.equal(env.lamports(env.client.pda.treasury()) - t0, SETUP_FEE);
    const st = env.switchState(sw);
    assert.equal(st.tier, 0);
    assert.equal(st.status, 0);
    assert.equal(st.intervalSecs, 30 * DAY);
    assert.equal(st.graceSecs, 7 * DAY);
    assert.equal(st.lastCheckIn, env.now);
    const cfg = env.config();
    assert.equal(cfg.switchesCreated, 1);
    assert.equal(cfg.switchesActive, 1);
  });

  it("Free tier: one switch, two heirs, standard intervals only", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const [a, b, c] = [0, 1, 2].map(() => Keypair.generate().publicKey);
    const mk = (h: ReturnType<typeof heirs>, days = 30, id = 0) =>
      env.client.createSwitch({ owner: owner.publicKey, id, intervalSecs: days * DAY, heirs: h });
    assert.equal(await env.sendErr([mk(heirs([a, 4000], [b, 3000], [c, 3000]))], [owner]), "TooManyHeirs");
    assert.equal(await env.sendErr([mk(heirs([a, 10_000]), 45)], [owner]), "BadInterval");
    assert.equal(await env.sendErr([mk(heirs([a, 10_000]), 7)], [owner]), "BadInterval");
    for (const d of [30, 90, 180, 365]) {
      const e2 = await Env.create();
      const o = e2.wallet();
      await e2.sendOk([e2.client.createSwitch({ owner: o.publicKey, id: 0, intervalSecs: d * DAY, heirs: heirs([a, 10_000]) })], [o]);
    }
    await env.sendOk([mk(heirs([a, 5000], [b, 5000]))], [owner]);
    assert.equal(await env.sendErr([mk(heirs([a, 10_000]), 30, 1)], [owner]), "SwitchLimit");
  });

  it("rejects bad heir lists", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const [a, b] = [Keypair.generate().publicKey, Keypair.generate().publicKey];
    const mk = (h: ReturnType<typeof heirs>) =>
      env.client.createSwitch({ owner: owner.publicKey, id: 0, intervalSecs: 30 * DAY, heirs: h });
    assert.equal(await env.sendErr([mk([])], [owner]), "NoHeirs");
    assert.equal(await env.sendErr([mk(heirs([a, 5000], [b, 4999]))], [owner]), "SharesNot100");
    assert.equal(await env.sendErr([mk(heirs([a, 5000], [b, 5001]))], [owner]), "SharesNot100");
    assert.equal(await env.sendErr([mk(heirs([a, 10_000], [b, 0]))], [owner]), "ZeroShare");
    assert.equal(await env.sendErr([mk(heirs([a, 5000], [a, 5000]))], [owner]), "DuplicateHeir");
    assert.equal(await env.sendErr([mk(heirs([owner.publicKey, 10_000]))], [owner]), "InvalidHeir");
    const sw = env.client.pda.switch(owner.publicKey, 0);
    assert.equal(await env.sendErr([mk(heirs([sw, 10_000]))], [owner]), "InvalidHeir");
  });

  it("switch id must be the owner's next id", async () => {
    const env = await Env.create();
    const owner = env.wallet();
    const err = await env.sendErr(
      [env.client.createSwitch({ owner: owner.publicKey, id: 3, intervalSecs: 30 * DAY, heirs: heirs([Keypair.generate().publicKey, 10_000]) })],
      [owner],
    );
    assert.equal(err, "BadSwitchId");
  });

  it("Holder (1M) pays no fee and gets 10 heirs and 3 switches; Patron (10M) gets custom intervals and more switches", async () => {
    const env = await Env.create();
    const perp = await env.createMint({ decimals: 6, token2022: true });
    await env.sendOk([env.client.setPerpetuaMint(env.admin.publicKey, perp.mint)], [env.admin]);
    const unit = 1_000_000n;

    const holder = env.wallet();
    const hAta = await env.mintTo(perp, holder.publicKey, 1_000_000n * unit);
    const tierH = { holding: hAta, mint: perp.mint };
    const ten = Array.from({ length: 10 }, () => Keypair.generate().publicKey);
    const t0 = env.lamports(env.client.pda.treasury());
    const sw = await env.createSwitch(holder, ten.map((w) => ({ wallet: w, bps: 1000 })), { tier: tierH });
    assert.equal(env.lamports(env.client.pda.treasury()), t0, "no setup fee");
    assert.equal(env.switchState(sw).tier, 1);
    const eleven = [...ten, Keypair.generate().publicKey].map((w, i) => ({ wallet: w, bps: i === 0 ? 1000 : 900 }));
    assert.equal(await env.sendErr([env.client.updateHeirs(holder.publicKey, sw, eleven, tierH)], [holder]), "TooManyHeirs");
    assert.equal(await env.sendErr([env.client.updateInterval(holder.publicKey, sw, 10 * DAY, tierH)], [holder]), "BadInterval");
    // Holders get three switches; the fourth is refused.
    await env.createSwitch(holder, heirs([ten[0], 10_000]), { tier: tierH });
    await env.createSwitch(holder, heirs([ten[1], 10_000]), { tier: tierH });
    assert.equal(env.profile(holder.publicKey).activeSwitches, 3);
    assert.equal(
      await env.sendErr([env.client.createSwitch({ owner: holder.publicKey, id: 3, intervalSecs: 30 * DAY, heirs: heirs([ten[0], 10_000]), tier: tierH })], [holder]),
      "SwitchLimit",
    );

    const patron = env.wallet();
    const pAta = await env.mintTo(perp, patron.publicKey, 10_000_000n * unit);
    const tierP = { holding: pAta, mint: perp.mint };
    const sixteen = Array.from({ length: 16 }, () => ({ wallet: Keypair.generate().publicKey, bps: 625 }));
    const p1 = await env.createSwitch(patron, sixteen, { tier: tierP, intervalSecs: 7 * DAY });
    assert.equal(env.switchState(p1).tier, 2);
    await env.createSwitch(patron, heirs([ten[0], 10_000]), { tier: tierP, intervalSecs: 1825 * DAY });
    await env.createSwitch(patron, heirs([ten[1], 10_000]), { tier: tierP, intervalSecs: 400 * DAY });
    assert.equal(env.profile(patron.publicKey).activeSwitches, 3);
    const seventeen = Array.from({ length: 17 }, (_, i) => ({ wallet: Keypair.generate().publicKey, bps: i === 0 ? 400 : 600 }));
    assert.equal(await env.sendErr([env.client.updateHeirs(patron.publicKey, p1, seventeen, tierP)], [patron]), "TooManyHeirs");
    assert.equal(await env.sendErr([env.client.updateInterval(patron.publicKey, p1, 6 * DAY, tierP)], [patron]), "BadInterval");
    assert.equal(await env.sendErr([env.client.updateInterval(patron.publicKey, p1, 1826 * DAY, tierP)], [patron]), "BadInterval");

    // A 16-heir edit still fits one transaction with room for wallet guards.
    const size = await env.txSize([env.client.updateHeirs(patron.publicKey, p1, sixteen, tierP)], [patron]);
    assert.ok(size <= 1232 - 200, `update_heirs with 16 heirs is ${size} bytes`);
  });

  it("a holding that is not the owner's or not $PERPETUA is rejected", async () => {
    const env = await Env.create();
    const perp = await env.createMint();
    await env.sendOk([env.client.setPerpetuaMint(env.admin.publicKey, perp.mint)], [env.admin]);
    const owner = env.wallet();
    const rich = env.wallet();
    const richAta = await env.mintTo(perp, rich.publicKey, 50_000_000_000_000n);
    const other = await env.createMint();
    const otherAta = await env.mintTo(other, owner.publicKey, 50_000_000_000_000n);
    const h = heirs([Keypair.generate().publicKey, 10_000]);
    const mk = (tier: { holding: typeof richAta; mint: typeof richAta }) =>
      env.client.createSwitch({ owner: owner.publicKey, id: 0, intervalSecs: 30 * DAY, heirs: h, tier });
    assert.equal(await env.sendErr([mk({ holding: richAta, mint: perp.mint })], [owner]), "BadTierAccount");
    assert.equal(await env.sendErr([mk({ holding: otherAta, mint: other.mint })], [owner]), "BadTierAccount");
    assert.equal(await env.sendErr([mk({ holding: otherAta, mint: perp.mint })], [owner]), "BadTierAccount");
  });

  it("dropping below a tier blocks edits that need it, but check-ins keep working", async () => {
    const env = await Env.create();
    const perp = await env.createMint();
    await env.sendOk([env.client.setPerpetuaMint(env.admin.publicKey, perp.mint)], [env.admin]);
    const owner = env.wallet();
    const ata = await env.mintTo(perp, owner.publicKey, 1_000_000_000_000n);
    const tier = { holding: ata, mint: perp.mint };
    const five = Array.from({ length: 5 }, () => ({ wallet: Keypair.generate().publicKey, bps: 2000 }));
    const sw = await env.createSwitch(owner, five, { tier });
    await env.transferOut(owner, ata, perp.mint, perp.programId, 600_000_000_000n);
    assert.equal(await env.sendErr([env.client.updateInterval(owner.publicKey, sw, 90 * DAY, tier)], [owner]), "TooManyHeirs");
    await env.sendOk([env.client.checkIn(owner.publicKey, sw)], [owner]);
    // Trimming to two heirs brings the switch back within the Free tier.
    await env.sendOk([env.client.updateHeirs(owner.publicKey, sw, heirs([five[0].wallet, 5000], [five[1].wallet, 5000]), tier)], [owner]);
    assert.equal(env.switchState(sw).tier, 0);
  });
});
