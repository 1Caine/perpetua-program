// Stateful fuzzer. Runs seeded random sequences of owner actions, time jumps, wallet
// activity and permissionless execution against the real program binary, and checks
// protocol invariants after every step. Then fuzzes account substitution on every
// execution instruction.
//
//   npm run fuzz                 (default 200 sequences)
//   FUZZ_SEQ=1000 FUZZ_SEED=7 npm run fuzz
import assert from "node:assert/strict";
import { Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { DAY, Env, GRACE, TOKEN_PROGRAM_ID, TxError } from "./harness";
import { ASSET_STATE, KIND, STATUS, executableAtOf, type SwitchState } from "../client/client";

const SEQUENCES = Number(process.env.FUZZ_SEQ ?? 200);
const START = Number(process.env.FUZZ_START ?? 1);
const BASE_SEED = Number(process.env.FUZZ_SEED ?? 20261108);
const SUBST = Number(process.env.FUZZ_SUBST ?? Math.max(20, Math.floor(SEQUENCES / 4)));
const STEPS = Number(process.env.FUZZ_STEPS ?? 40);
let seed = BASE_SEED;

function rand() {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

function randomShares(n: number) {
  const cuts = Array.from({ length: n - 1 }, () => int(1, 9999)).sort((a, b) => a - b);
  const out: number[] = [];
  let prev = 0;
  for (const c of [...cuts, 10_000]) {
    out.push(c - prev);
    prev = c;
  }
  if (out.some((x) => x === 0)) return Array.from({ length: n }, (_, i) => (i === n - 1 ? 10_000 - Math.floor(10_000 / n) * (n - 1) : Math.floor(10_000 / n)));
  return out;
}

type Tracked = {
  owner: Keypair;
  sw: PublicKey;
  heirs: PublicKey[];
  tokens: { mint: PublicKey; ata: PublicKey }[];
  status: number;
  // Owner token balances we expect, absent settlement.
  expected: Map<string, bigint>;
};

const editable = (t: Tracked) => t.status === STATUS.ACTIVE || t.status === STATUS.PAUSED;
const stats = { sequences: 0, steps: 0, triggers: 0, executions: 0, rejected: 0, checkIns: 0, cancels: 0, substitutions: 0 };

async function sequence(n: number) {
  // Every sequence has its own seed, so any failure replays alone with FUZZ_START=n FUZZ_SEQ=1.
  seed = BASE_SEED * 100_003 + n;
  const env = await Env.create();
  const owners: Tracked[] = [];
  const nOwners = int(1, 3);
  for (let o = 0; o < nOwners; o++) {
    const owner = env.wallet(30);
    const nHeirs = int(1, 2);
    const heirKeys = Array.from({ length: nHeirs }, () => (rand() < 0.5 ? Keypair.generate().publicKey : env.wallet(1).publicKey));
    const shares = randomShares(nHeirs);
    const sw = await env.createSwitch(
      owner,
      heirKeys.map((wallet, i) => ({ wallet, bps: shares[i] })),
      { intervalDays: pick([30, 90, 180, 365]) },
    );
    const tokens: Tracked["tokens"] = [];
    const expected = new Map<string, bigint>();
    for (let t = 0; t < int(0, 3); t++) {
      const m = await env.createMint({ decimals: int(1, 9), freezeAuthority: true });
      const amount = BigInt(int(1, 1_000_000_000));
      const ata = await env.mintTo(m, owner.publicKey, amount);
      await env.sendOk(
        [env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: BigInt(int(1, Number(amount))) })],
        [owner],
      );
      tokens.push({ mint: m.mint, ata });
      expected.set(ata.toBase58(), amount);
    }
    if (rand() < 0.6) {
      await env.sendOk([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: BigInt(int(10_000_000, 5_000_000_000)) })], [owner]);
    }
    owners.push({ owner, sw, heirs: heirKeys, tokens, status: STATUS.ACTIVE, expected });
  }

  for (let step = 0; step < STEPS; step++) {
    stats.steps++;
    const t = pick(owners);
    const roll = rand();
    const caller = env.wallet(2);
    try {
      if (roll < 0.25) {
        env.advance(int(1, 120) * DAY + int(0, DAY));
      } else if (roll < 0.35) {
        if (t.status === STATUS.ACTIVE) {
          await env.send([env.client.checkIn(t.owner.publicKey, t.sw)], [t.owner]);
          stats.checkIns++;
        }
      } else if (roll < 0.45 && t.tokens.length) {
        // Owner moves some tokens out of a delegated account, as a living owner might.
        const tok = pick(t.tokens);
        const bal = env.balance(tok.ata);
        if (bal > 0n && editable(t)) {
          const amt = BigInt(int(1, Number(bal > 1_000_000_000n ? 1_000_000_000n : bal)));
          await env.transferOut(t.owner, tok.ata, tok.mint, TOKEN_PROGRAM_ID, amt);
          t.expected.set(tok.ata.toBase58(), bal - amt);
        }
      } else if (roll < 0.5 && t.tokens.length && editable(t)) {
        await env.approveOther(t.owner, pick(t.tokens).ata, TOKEN_PROGRAM_ID, 1n);
      } else if (roll < 0.55 && editable(t)) {
        await env.send([t.status === STATUS.ACTIVE ? env.client.pause(t.owner.publicKey, t.sw) : env.client.resume(t.owner.publicKey, t.sw)], [t.owner]);
        t.status = t.status === STATUS.ACTIVE ? STATUS.PAUSED : STATUS.ACTIVE;
      } else if (roll < 0.58 && editable(t)) {
        await env.send([env.client.cancel(t.owner.publicKey, t.sw, env.switchState(t.sw))], [t.owner]);
        t.status = -1;
        stats.cancels++;
      } else if (t.status >= 0) {
        // Anyone tries to push execution forward. The program must agree with our model of time.
        const before = env.switchState(t.sw);
        const shouldTrigger = before.status === STATUS.ACTIVE && env.now >= executableAtOf(before);
        if (before.status === STATUS.ACTIVE) {
          const res = await env.send([env.client.trigger(caller.publicKey, t.sw, t.owner.publicKey)], [caller]).then(
            () => true,
            (e) => {
              if (!(e instanceof TxError)) throw e;
              return false;
            },
          );
          assert.equal(res, shouldTrigger, `trigger outcome mismatch (now ${env.now}, executable ${executableAtOf(before)})`);
          if (res) stats.triggers++;
          else stats.rejected++;
        }
        const st = env.switchState(t.sw);
        if (st.status === STATUS.TRIGGERED || st.status === STATUS.EXECUTED) {
          t.status = st.status;
          await env.execute(t.sw, caller);
          t.status = STATUS.EXECUTED;
        }
      }
    } catch (e) {
      if (!(e instanceof TxError)) throw e;
      stats.rejected++;
    }
    checkInvariants(env, owners);
  }

  // Finish everything that can finish, then check conservation per switch.
  env.advance(400 * DAY + GRACE);
  for (const t of owners) {
    if (t.status < 0 || t.status === STATUS.PAUSED) continue;
    await env.execute(t.sw);
    t.status = STATUS.EXECUTED;
    stats.executions++;
    checkConservation(env, t);
  }
  checkInvariants(env, owners);
  stats.sequences++;
  if (n % 50 === 0) console.log(`  ${n}`, JSON.stringify(stats));
}

function checkInvariants(env: Env, owners: Tracked[]) {
  let active = 0;
  for (const t of owners) {
    if (t.status < 0) {
      assert.equal(env.exists(t.sw), false, "cancelled switch is closed");
      continue;
    }
    const st = env.switchState(t.sw);
    if (st.status <= STATUS.PAUSED) active++;
    // Before settlement nothing leaves an owner's account except what the owner moved.
    for (const tok of t.tokens) {
      const i = st.assets.findIndex((a) => a.tokenAccount.equals(tok.ata));
      const settled = i >= 0 && st.assets[i].state !== ASSET_STATE.PENDING;
      if (!settled && env.exists(tok.ata)) {
        assert.equal(env.balance(tok.ata), t.expected.get(tok.ata.toBase58()), "owner balance moved without settlement");
      }
    }
    // Escrow can never exceed what was settled; shares never exceed escrow.
    for (const a of st.assets) {
      assert.ok(a.escrowed >= 0n && a.fee >= 0n);
      if (a.state === ASSET_STATE.PENDING) assert.ok(a.escrowed === 0n && a.fee === 0n);
      if (a.state !== ASSET_STATE.PENDING && a.state !== ASSET_STATE.SKIPPED) assert.ok(a.escrowed + a.fee <= a.approved, "settled more than was delegated");
    }
    if (st.status >= STATUS.TRIGGERED) assert.ok(st.triggeredAt >= executableAtOf(st), "triggered before executable");
  }
  assert.equal(env.config().switchesActive, active, "active counter drift");
}

function checkConservation(env: Env, t: Tracked) {
  const st: SwitchState = env.switchState(t.sw);
  assert.equal(st.status, STATUS.EXECUTED);
  for (const a of st.assets) {
    if (a.state !== ASSET_STATE.DELIVERED) continue;
    const net = a.escrowed;
    const shares = st.heirs.map((h, i) => {
      if (a.recipient !== 255) return i === a.recipient ? net : 0n;
      if (i < st.heirs.length - 1) return (net * BigInt(h.bps)) / 10_000n;
      return net - st.heirs.slice(0, -1).reduce((s, x) => s + (net * BigInt(x.bps)) / 10_000n, 0n);
    });
    assert.equal(shares.reduce((s, x) => s + x, 0n), net, "shares sum to escrow");
    const gross = net + a.fee;
    assert.equal(
      a.fee,
      (gross * 50n) / 10_000n,
      `fee is exactly 0.5% (floor): net ${net} gross ${gross} kind ${a.kind} approved ${a.approved} escrowed ${a.escrowed} fee ${a.fee} heirs ${st.heirs.length} recipient ${a.recipient}`,
    );
    if (a.kind !== KIND.SOL) {
      st.heirs.forEach((h, i) => {
        assert.equal(env.balance(env.ata(a.mint, h.wallet)), shares[i], "heir received exact share");
      });
    }
  }
}

async function substitutionFuzz(rounds: number) {
  for (let r = 0; r < rounds; r++) {
    const env = await Env.create();
    const owner = env.wallet(10);
    const attacker = env.wallet(10);
    const [h0, h1] = [Keypair.generate().publicKey, Keypair.generate().publicKey];
    const m = await env.createMint();
    const ata = await env.mintTo(m, owner.publicKey, 1_000_000n);
    const evil = await env.mintTo(m, attacker.publicKey, 1_000_000n);
    const sw = await env.createSwitch(owner, [{ wallet: h0, bps: 5000 }, { wallet: h1, bps: 5000 }]);
    await env.sendOk([env.client.addTokenAsset({ owner: owner.publicKey, sw, mint: m.mint, tokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID, amount: 1_000_000n })], [owner]);
    await env.sendOk([env.client.addSolAsset({ owner: owner.publicKey, sw, lamports: 100_000_000n })], [owner]);
    env.advance(37 * DAY);
    const pool = [attacker.publicKey, evil, owner.publicKey, sw, env.client.pda.treasury(), Keypair.generate().publicKey, m.mint, ata];
    for (let guard = 0; guard < 40; guard++) {
      const st = env.switchState(sw);
      const steps = await env.client.nextExecutionSteps(attacker.publicKey, sw, st, env.now);
      if (!steps.length) break;
      const ix = steps[0].ix;
      // Try a forged copy first: one non-signer account swapped for a hostile one.
      const forged = substitute(ix, pool);
      if (forged) {
        stats.substitutions++;
        const before = snapshot(env, [ata, evil, h0, h1, attacker.publicKey]);
        const ok = await env.send([forged], [attacker]).then(() => true, () => false);
        if (ok) {
          // A substitution that succeeds must be harmless (e.g. swapping in an identical key).
          const after = snapshot(env, [ata, evil, h0, h1, attacker.publicKey]);
          assert.ok(after.get(evil.toBase58())! <= before.get(evil.toBase58())!, "attacker token balance grew");
        }
      }
      const fresh = await env.client.nextExecutionSteps(attacker.publicKey, sw, env.switchState(sw), env.now);
      if (fresh.length) await env.sendOk([fresh[0].ix], [attacker]);
    }
    const st = env.switchState(sw);
    assert.equal(st.status, STATUS.EXECUTED);
    assert.equal(env.balance(evil), 1_000_000n, "attacker gained no tokens");
    const net = 1_000_000n - (1_000_000n * 50n) / 10_000n;
    assert.equal(env.balance(env.ata(m.mint, h0)) + env.balance(env.ata(m.mint, h1)), net);
  }
}

function substitute(ix: TransactionInstruction, pool: PublicKey[]): TransactionInstruction | null {
  const idxs = ix.keys.map((k, i) => (k.isSigner ? -1 : i)).filter((i) => i >= 0);
  if (!idxs.length) return null;
  const i = pick(idxs);
  const replacement = pick(pool);
  if (replacement.equals(ix.keys[i].pubkey)) return null;
  const keys = ix.keys.map((k, j) => (j === i ? { ...k, pubkey: replacement } : k));
  return { ...ix, keys } as TransactionInstruction;
}

function snapshot(env: Env, keys: PublicKey[]) {
  const out = new Map<string, bigint>();
  for (const k of keys) {
    const tok = env.tokenAccount(k);
    out.set(k.toBase58(), tok ? tok.amount : BigInt(env.lamports(k)));
  }
  return out;
}

const t0 = Date.now();
console.log(`fuzz: sequences ${START}..${START + SEQUENCES - 1} x ${STEPS} steps, seed ${BASE_SEED}`);
for (let i = START; i < START + SEQUENCES; i++) await sequence(i);
if (SUBST > 0) await substitutionFuzz(SUBST);
console.log("fuzz passed", JSON.stringify(stats), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
