// Instruction builders and account readers for the Perpetua program.
// Shared by the site, the keeper, scripts and the program test suite, so the
// transactions users sign are exactly the ones the tests exercise.
import { AnchorProvider, BN, type BorshCoder, Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  type AccountMeta,
  type Connection,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import idlJson from "./idl.json" with { type: "json" };
import type { Perpetua } from "./idl-types";

export const IDL = idlJson as unknown as Perpetua;
export const MAINNET_PROGRAM_ID = new PublicKey("PerpX2pWbVffrbJfb4zbDtGkJeWGyucH2HVPkvdpDit");
export const DEVNET_PROGRAM_ID = new PublicKey("PerpfW46kjYYhYcPzNxnyuTrsWBSNXax953aPrd3FCo");
export const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

export const STATUS = { ACTIVE: 0, PAUSED: 1, TRIGGERED: 2, EXECUTED: 3 } as const;
export const KIND = { SOL: 0, TOKEN: 1, NFT: 2 } as const;
export const ASSET_STATE = { PENDING: 0, SETTLED: 1, DELIVERED: 2, SKIPPED: 3 } as const;
export const TIER = { FREE: 0, HOLDER: 1, PATRON: 2 } as const;
export const SPLIT = 255;
/** Byte offset of `status` in a Switch account (8 discriminator + 32 owner + 4 id + 1 bump). */
export const SWITCH_STATUS_OFFSET = 45;

const enc = (s: string) => new TextEncoder().encode(s);
const u32le = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};

export function pdas(programId: PublicKey) {
  const find = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, programId)[0];
  return {
    config: () => find([enc("config")]),
    treasury: () => find([enc("treasury")]),
    profile: (owner: PublicKey) => find([enc("owner"), owner.toBytes()]),
    switch: (owner: PublicKey, id: number) => find([enc("switch"), owner.toBytes(), u32le(id)]),
    reserve: (sw: PublicKey) => find([enc("reserve"), sw.toBytes()]),
    programData: () => PublicKey.findProgramAddressSync([programId.toBytes()], BPF_UPGRADEABLE_LOADER)[0],
  };
}

export type HeirInput = { wallet: PublicKey; bps: number };
export type TierAccounts = { holding: PublicKey; mint: PublicKey } | null;

export type HeirState = { wallet: PublicKey; bps: number; letter: number[] };
// u64 amounts are native bigint and timestamps plain numbers. Decoded bn.js values are
// converted from their raw words: Node 24's Maglev JIT was caught (by our fuzzer)
// miscompiling bn.js decimal toString(), so no amount ever passes through it.
export type AssetState = {
  kind: number;
  mint: PublicKey;
  tokenAccount: PublicKey;
  token2022: boolean;
  recipient: number;
  state: number;
  approved: bigint;
  escrowed: bigint;
  fee: bigint;
  delivered: bigint;
};
export type SwitchState = {
  owner: PublicKey;
  id: number;
  bump: number;
  status: number;
  tier: number;
  reserveBump: number;
  intervalSecs: number;
  graceSecs: number;
  createdAt: number;
  lastCheckIn: number;
  triggeredAt: number;
  executedAt: number;
  checkIns: number;
  heirs: HeirState[];
  assets: AssetState[];
};
export type ConfigState = {
  admin: PublicKey;
  engine: PublicKey;
  perpetuaMint: PublicKey;
  paused: boolean;
  bump: number;
  treasuryBump: number;
  switchesCreated: number;
  switchesActive: number;
  executions: number;
};
export type ProfileState = { owner: PublicKey; activeSwitches: number; nextId: number; bump: number };

// Program converts the IDL to camelCase; its coder decodes accounts with camelCase fields.
const offlineProvider = {
  connection: {} as Connection,
  publicKey: PublicKey.default,
} as unknown as AnchorProvider;
export const coder = new Program<Perpetua>(IDL, offlineProvider).coder as unknown as BorshCoder;

/** bn.js value to bigint using only its 26-bit words (no bn.js arithmetic). */
export function toBig(v: BN | { words: number[]; length: number; negative: number }): bigint {
  const b = v as unknown as { words: number[]; length: number; negative: number };
  let out = 0n;
  for (let i = b.length - 1; i >= 0; i--) out = (out << 26n) + BigInt(b.words[i] ?? 0);
  return b.negative ? -out : out;
}
const toNum = (v: BN) => Number(toBig(v));
/** bigint or number to bn.js via hex, which avoids bn.js decimal parsing. */
export function bnOf(v: bigint | number | string): BN {
  const x = BigInt(v);
  return x < 0n ? new BN((-x).toString(16), 16).neg() : new BN(x.toString(16), 16);
}

type Raw = Record<string, unknown>;
export function decodeSwitch(data: Buffer | Uint8Array): SwitchState {
  const r = coder.accounts.decode("switch", Buffer.from(data)) as Raw;
  return {
    ...(r as unknown as SwitchState),
    intervalSecs: toNum(r.intervalSecs as BN),
    graceSecs: toNum(r.graceSecs as BN),
    createdAt: toNum(r.createdAt as BN),
    lastCheckIn: toNum(r.lastCheckIn as BN),
    triggeredAt: toNum(r.triggeredAt as BN),
    executedAt: toNum(r.executedAt as BN),
    assets: (r.assets as Raw[]).map((a) => ({
      ...(a as unknown as AssetState),
      approved: toBig(a.approved as BN),
      escrowed: toBig(a.escrowed as BN),
      fee: toBig(a.fee as BN),
      delivered: toBig(a.delivered as BN),
    })),
  };
}
export function decodeConfig(data: Buffer | Uint8Array): ConfigState {
  const r = coder.accounts.decode("config", Buffer.from(data)) as Raw;
  return {
    ...(r as unknown as ConfigState),
    switchesCreated: toNum(r.switchesCreated as BN),
    switchesActive: toNum(r.switchesActive as BN),
    executions: toNum(r.executions as BN),
  };
}
export function decodeProfile(data: Buffer | Uint8Array): ProfileState {
  return coder.accounts.decode("ownerProfile", Buffer.from(data)) as ProfileState;
}

export const deadlineOf = (s: SwitchState) => s.lastCheckIn + s.intervalSecs;
export const executableAtOf = (s: SwitchState) => deadlineOf(s) + s.graceSecs;

const tokenProgramFor = (a: { token2022: boolean }) => (a.token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);

/** Builds instructions only; never signs or sends. */
export class PerpetuaClient {
  readonly program: Program<Perpetua>;
  readonly pda: ReturnType<typeof pdas>;

  constructor(
    readonly connection: Connection,
    readonly programId: PublicKey,
  ) {
    // Anchor wants a provider; a wallet is never used because we only build instructions.
    const provider = new AnchorProvider(
      connection,
      {
        publicKey: PublicKey.default,
        signTransaction: async () => {
          throw new Error("PerpetuaClient builds instructions only");
        },
        signAllTransactions: async () => {
          throw new Error("PerpetuaClient builds instructions only");
        },
      },
      { commitment: "confirmed" },
    );
    this.program = new Program<Perpetua>({ ...IDL, address: programId.toBase58() } as Perpetua, provider);
    this.pda = pdas(programId);
  }

  private tier(t: TierAccounts) {
    return { tierHolding: t?.holding ?? null, tierMint: t?.mint ?? null };
  }

  // ---------- reads ----------
  async fetchSwitch(address: PublicKey): Promise<SwitchState | null> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    return info ? decodeSwitch(info.data) : null;
  }
  async fetchConfig(): Promise<ConfigState | null> {
    const info = await this.connection.getAccountInfo(this.pda.config(), "confirmed");
    return info ? decodeConfig(info.data) : null;
  }
  async fetchProfile(owner: PublicKey): Promise<ProfileState | null> {
    const info = await this.connection.getAccountInfo(this.pda.profile(owner), "confirmed");
    return info ? decodeProfile(info.data) : null;
  }

  // ---------- admin ----------
  initialize(admin: PublicKey, engine: PublicKey) {
    return this.program.methods
      .initialize(engine)
      .accountsStrict({
        admin,
        config: this.pda.config(),
        treasury: this.pda.treasury(),
        program: this.programId,
        programData: this.pda.programData(),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
  setEngine(admin: PublicKey, engine: PublicKey) {
    return this.program.methods.setEngine(engine).accountsStrict({ admin, config: this.pda.config() }).instruction();
  }
  setPaused(admin: PublicKey, paused: boolean) {
    return this.program.methods.setPaused(paused).accountsStrict({ admin, config: this.pda.config() }).instruction();
  }
  setAdmin(admin: PublicKey, newAdmin: PublicKey) {
    return this.program.methods.setAdmin(newAdmin).accountsStrict({ admin, config: this.pda.config() }).instruction();
  }
  setPerpetuaMint(admin: PublicKey, mint: PublicKey) {
    return this.program.methods
      .setPerpetuaMint()
      .accountsStrict({ admin, config: this.pda.config(), mint })
      .instruction();
  }
  sweepSol(engine: PublicKey, lamports: bigint | number) {
    return this.program.methods
      .sweepSol(bnOf(lamports))
      .accountsStrict({
        engine,
        config: this.pda.config(),
        treasury: this.pda.treasury(),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
  sweepToken(engine: PublicKey, mint: PublicKey, tokenProgram: PublicKey, amount: bigint | number) {
    const treasury = this.pda.treasury();
    return this.program.methods
      .sweepToken(bnOf(amount))
      .accountsStrict({
        engine,
        config: this.pda.config(),
        treasury,
        mint,
        treasuryToken: getAssociatedTokenAddressSync(mint, treasury, true, tokenProgram),
        engineToken: getAssociatedTokenAddressSync(mint, engine, true, tokenProgram),
        tokenProgram,
      })
      .instruction();
  }

  // ---------- owner ----------
  createSwitch(p: { owner: PublicKey; id: number; intervalSecs: number; heirs: HeirInput[]; tier?: TierAccounts }) {
    return this.program.methods
      .createSwitch(p.id, bnOf(p.intervalSecs), p.heirs)
      .accountsStrict({
        owner: p.owner,
        config: this.pda.config(),
        profile: this.pda.profile(p.owner),
        switch: this.pda.switch(p.owner, p.id),
        treasury: this.pda.treasury(),
        ...this.tier(p.tier ?? null),
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  private ownerEdit(owner: PublicKey, sw: PublicKey, tier?: TierAccounts) {
    return {
      owner,
      config: this.pda.config(),
      switch: sw,
      ...this.tier(tier ?? null),
      systemProgram: SystemProgram.programId,
    };
  }
  updateHeirs(owner: PublicKey, sw: PublicKey, heirs: HeirInput[], tier?: TierAccounts) {
    return this.program.methods.updateHeirs(heirs).accountsStrict(this.ownerEdit(owner, sw, tier)).instruction();
  }
  updateInterval(owner: PublicKey, sw: PublicKey, intervalSecs: number, tier?: TierAccounts) {
    return this.program.methods
      .updateInterval(bnOf(intervalSecs))
      .accountsStrict(this.ownerEdit(owner, sw, tier))
      .instruction();
  }
  setLetters(owner: PublicKey, sw: PublicKey, letters: Uint8Array[], tier?: TierAccounts) {
    return this.program.methods
      .setLetters(letters.map((l) => Array.from(l)))
      .accountsStrict(this.ownerEdit(owner, sw, tier))
      .instruction();
  }
  setAssetRecipient(owner: PublicKey, sw: PublicKey, index: number, recipient: number, tier?: TierAccounts) {
    return this.program.methods
      .setAssetRecipient(index, recipient)
      .accountsStrict(this.ownerEdit(owner, sw, tier))
      .instruction();
  }

  addTokenAsset(p: {
    owner: PublicKey;
    sw: PublicKey;
    mint: PublicKey;
    tokenAccount: PublicKey;
    tokenProgram: PublicKey;
    amount: bigint | number;
    recipient?: number;
    tier?: TierAccounts;
  }) {
    return this.program.methods
      .addTokenAsset(bnOf(p.amount), p.recipient ?? SPLIT)
      .accountsStrict({
        owner: p.owner,
        config: this.pda.config(),
        switch: p.sw,
        mint: p.mint,
        tokenAccount: p.tokenAccount,
        ...this.tier(p.tier ?? null),
        tokenProgram: p.tokenProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
  setAssetAmount(p: {
    owner: PublicKey;
    sw: PublicKey;
    index: number;
    mint: PublicKey;
    tokenAccount: PublicKey;
    tokenProgram: PublicKey;
    amount: bigint | number;
    tier?: TierAccounts;
  }) {
    return this.program.methods
      .setAssetAmount(p.index, bnOf(p.amount))
      .accountsStrict({
        owner: p.owner,
        config: this.pda.config(),
        switch: p.sw,
        mint: p.mint,
        tokenAccount: p.tokenAccount,
        ...this.tier(p.tier ?? null),
        tokenProgram: p.tokenProgram,
      })
      .instruction();
  }
  addSolAsset(p: { owner: PublicKey; sw: PublicKey; lamports: bigint | number; recipient?: number; tier?: TierAccounts }) {
    return this.program.methods
      .addSolAsset(bnOf(p.lamports), p.recipient ?? SPLIT)
      .accountsStrict({
        owner: p.owner,
        config: this.pda.config(),
        switch: p.sw,
        nativeMint: NATIVE_MINT,
        reserve: this.pda.reserve(p.sw),
        ...this.tier(p.tier ?? null),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
  fundSol(owner: PublicKey, sw: PublicKey, lamports: bigint | number) {
    return this.program.methods
      .fundSol(bnOf(lamports))
      .accountsStrict({
        owner,
        switch: sw,
        nativeMint: NATIVE_MINT,
        reserve: this.pda.reserve(sw),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
  removeAsset(owner: PublicKey, sw: PublicKey, index: number, tokenAccount: PublicKey) {
    return this.program.methods
      .removeAsset(index)
      .accountsStrict({
        owner,
        switch: sw,
        tokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
  checkIn(owner: PublicKey, sw: PublicKey) {
    return this.program.methods.checkIn().accountsStrict({ owner, switch: sw }).instruction();
  }
  pause(owner: PublicKey, sw: PublicKey) {
    return this.program.methods.pause().accountsStrict({ owner, switch: sw }).instruction();
  }
  resume(owner: PublicKey, sw: PublicKey) {
    return this.program.methods.resume().accountsStrict({ owner, switch: sw }).instruction();
  }
  cancel(owner: PublicKey, sw: PublicKey, state: SwitchState) {
    const remaining: AccountMeta[] = state.assets.map((a) => ({
      pubkey: a.tokenAccount,
      isSigner: false,
      isWritable: true,
    }));
    return this.program.methods
      .cancel()
      .accountsStrict({
        owner,
        config: this.pda.config(),
        profile: this.pda.profile(owner),
        switch: sw,
        tokenProgram: TOKEN_PROGRAM_ID,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .remainingAccounts(remaining)
      .instruction();
  }

  // ---------- execution (permissionless) ----------
  trigger(caller: PublicKey, sw: PublicKey, owner: PublicKey) {
    return this.program.methods
      .trigger()
      .accountsStrict({ caller, config: this.pda.config(), profile: this.pda.profile(owner), switch: sw })
      .instruction();
  }
  settleAsset(payer: PublicKey, sw: PublicKey, state: SwitchState, index: number) {
    const a = state.assets[index];
    const tp = tokenProgramFor(a);
    const treasury = this.pda.treasury();
    return this.program.methods
      .settleAsset(index)
      .accountsStrict({
        payer,
        config: this.pda.config(),
        switch: sw,
        source: a.tokenAccount,
        mint: a.mint,
        escrow: getAssociatedTokenAddressSync(a.mint, sw, true, tp),
        treasury,
        treasuryToken: getAssociatedTokenAddressSync(a.mint, treasury, true, tp),
        tokenProgram: tp,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
  deliver(payer: PublicKey, sw: PublicKey, state: SwitchState, index: number, heirIndex: number) {
    const a = state.assets[index];
    const heir = state.heirs[heirIndex].wallet;
    if (a.kind === KIND.SOL) {
      return this.program.methods
        .deliverSol(index, heirIndex)
        .accountsStrict({
          payer,
          config: this.pda.config(),
          switch: sw,
          heir,
          treasury: this.pda.treasury(),
        })
        .instruction();
    }
    const tp = tokenProgramFor(a);
    return this.program.methods
      .deliverToken(index, heirIndex)
      .accountsStrict({
        payer,
        switch: sw,
        mint: a.mint,
        escrow: getAssociatedTokenAddressSync(a.mint, sw, true, tp),
        heir,
        heirToken: getAssociatedTokenAddressSync(a.mint, heir, true, tp),
        tokenProgram: tp,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }
  skipAsset(caller: PublicKey, sw: PublicKey, state: SwitchState, index: number) {
    return this.program.methods
      .skipAsset(index)
      .accountsStrict({ caller, switch: sw, source: state.assets[index].tokenAccount })
      .instruction();
  }

  /**
   * Next execution step for a switch, given its current state and the time.
   * The keeper sends these one by one; each is idempotent against state, so a
   * failed or duplicated step is harmless.
   */
  async nextExecutionSteps(
    payer: PublicKey,
    sw: PublicKey,
    state: SwitchState,
    nowSecs: number,
  ): Promise<{ label: string; ix: TransactionInstruction }[]> {
    if (state.status === STATUS.ACTIVE) {
      if (nowSecs < executableAtOf(state)) return [];
      return [{ label: "trigger", ix: await this.trigger(payer, sw, state.owner) }];
    }
    if (state.status !== STATUS.TRIGGERED) return [];
    const steps: { label: string; ix: TransactionInstruction }[] = [];
    for (let i = 0; i < state.assets.length; i++) {
      const a = state.assets[i];
      if (a.state === ASSET_STATE.PENDING) {
        steps.push({ label: `settle ${i}`, ix: await this.settleAsset(payer, sw, state, i) });
      } else if (a.state === ASSET_STATE.SETTLED) {
        const mask = a.delivered;
        for (let h = 0; h < state.heirs.length; h++) {
          if ((mask & (1n << BigInt(h))) === 0n) {
            steps.push({ label: `deliver ${i}:${h}`, ix: await this.deliver(payer, sw, state, i, h) });
          }
        }
      }
    }
    return steps;
  }
}

export function ataFor(mint: PublicKey, owner: PublicKey, token2022 = false) {
  return getAssociatedTokenAddressSync(mint, owner, true, token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);
}
