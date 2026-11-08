// Test harness: an in-process Solana VM (LiteSVM) with the Perpetua program loaded
// as an upgradeable program, plus token helpers and a clock we can move.
import {
  AuthorityType,
  ExtensionType,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createApproveInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createFreezeAccountInstruction,
  createInitializeDefaultAccountStateInstruction,
  createInitializeMint2Instruction,
  createInitializeMintCloseAuthorityInstruction,
  createInitializeNonTransferableMintInstruction,
  createInitializeTransferFeeConfigInstruction,
  createInitializeTransferHookInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  createTransferInstruction,
  AccountState,
  getAssociatedTokenAddressSync,
  getMintLen,
  MINT_SIZE,
  MintLayout,
  unpackAccount,
} from "@solana/spl-token";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { Clock, FailedTransactionMetadata, LiteSVM, TransactionMetadata } from "litesvm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import IDL from "../client/idl.json" with { type: "json" };
import {
  BPF_UPGRADEABLE_LOADER,
  MAINNET_PROGRAM_ID,
  PerpetuaClient,
  decodeConfig,
  decodeProfile,
  decodeSwitch,
  type HeirInput,
  type SwitchState,
} from "../client/client";

export const PROGRAM_ID = MAINNET_PROGRAM_ID;
export const SO_PATH = fileURLToPath(new URL("../target/deploy/perpetua.so", import.meta.url));
export const DAY = 86_400;
export const C = Object.fromEntries(
  (IDL as { constants: { name: string; value: string }[] }).constants.map((c) => [c.name, c.value]),
) as Record<string, string>;
export const SETUP_FEE = Number(C.SETUP_FEE_LAMPORTS);
export const GRACE = Number(C.GRACE_DAYS) * DAY;

const errorCodes = new Map<number, string>(
  (IDL as { errors: { code: number; name: string }[] }).errors.map((e) => [e.code, e.name]),
);

export class TxError extends Error {
  constructor(
    readonly logs: string[],
    readonly raw: string,
  ) {
    super(TxError.describe(logs, raw));
  }
  static describe(logs: string[], raw: string) {
    const anchor = logs.find((l) => l.includes("Error Code:"));
    if (anchor) return anchor.replace(/^Program log: /, "");
    const custom = raw.match(/Custom\((\d+)\)/);
    if (custom) return `custom ${custom[1]} ${errorCodes.get(Number(custom[1])) ?? ""}`;
    return raw + "\n" + logs.slice(-6).join("\n");
  }
  /** Anchor error name (e.g. "TooEarly"), or the raw runtime error. */
  get code(): string {
    const m = this.message.match(/Error Code: (\w+)/);
    if (m) return m[1];
    const c = this.message.match(/custom \d+ (\w+)/);
    return c ? c[1] : this.message;
  }
}

export class Env {
  readonly svm: LiteSVM;
  readonly client: PerpetuaClient;
  readonly admin = Keypair.generate();
  readonly engine = Keypair.generate();
  readonly keeper = Keypair.generate();
  now: number;

  static async create(opts: { initialize?: boolean } = {}) {
    const env = new Env();
    if (opts.initialize !== false) {
      await env.sendOk([env.client.initialize(env.admin.publicKey, env.engine.publicKey)], [env.admin]);
    }
    return env;
  }

  private constructor() {
    this.svm = new LiteSVM();
    this.svm.addProgram(PROGRAM_ID, readFileSync(SO_PATH));
    // The client never touches the network here; reads go through this.svm.
    this.client = new PerpetuaClient({} as never, PROGRAM_ID);
    this.now = 1_800_000_000;
    this.setTime(this.now);
    this.airdrop(this.admin.publicKey, 100);
    this.airdrop(this.engine.publicKey, 10);
    this.airdrop(this.keeper.publicKey, 100);
    this.setUpgradeAuthority(this.admin.publicKey);
    this.installNativeMint();
  }

  /** The wSOL mint exists on every real cluster; LiteSVM starts without it. */
  installNativeMint() {
    const data = Buffer.alloc(MINT_SIZE);
    MintLayout.encode(
      {
        mintAuthorityOption: 0,
        mintAuthority: PublicKey.default,
        supply: 0n,
        decimals: 9,
        isInitialized: true,
        freezeAuthorityOption: 0,
        freezeAuthority: PublicKey.default,
      },
      data,
    );
    this.svm.setAccount(NATIVE_MINT, {
      lamports: Number(this.svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE))),
      data,
      owner: TOKEN_PROGRAM_ID,
      executable: false,
    });
  }

  /** LiteSVM loads programs with no upgrade authority; write one into ProgramData. */
  setUpgradeAuthority(authority: PublicKey | null) {
    const pd = this.client.pda.programData();
    const acc = this.svm.getAccount(pd)!;
    const data = Buffer.from(acc.data);
    // UpgradeableLoaderState::ProgramData { slot: u64, upgrade_authority_address: Option<Pubkey> }
    data.writeUInt32LE(3, 0);
    data[12] = authority ? 1 : 0;
    (authority ?? PublicKey.default).toBuffer().copy(data, 13);
    this.svm.setAccount(pd, { ...acc, data, owner: BPF_UPGRADEABLE_LOADER });
  }

  setTime(unix: number) {
    this.now = unix;
    const c = this.svm.getClock();
    this.svm.setClock(new Clock(c.slot + 1n, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, BigInt(unix)));
  }
  advance(seconds: number) {
    this.setTime(this.now + seconds);
  }

  airdrop(to: PublicKey, sol: number) {
    this.svm.airdrop(to, BigInt(Math.round(sol * LAMPORTS_PER_SOL)));
  }
  wallet(sol = 10) {
    const k = Keypair.generate();
    if (sol > 0) this.airdrop(k.publicKey, sol);
    return k;
  }
  lamports(pk: PublicKey): number {
    return Number(this.svm.getBalance(pk) ?? 0n);
  }
  exists(pk: PublicKey) {
    const a = this.svm.getAccount(pk);
    return !!a && (a.lamports > 0 || a.data.length > 0);
  }

  async send(ixs: (TransactionInstruction | Promise<TransactionInstruction>)[], signers: Keypair[]) {
    const resolved = await Promise.all(ixs);
    this.svm.expireBlockhash();
    const tx = new Transaction();
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.feePayer = signers[0].publicKey;
    tx.add(...resolved);
    tx.sign(...signers);
    const res = this.svm.sendTransaction(tx);
    if (res instanceof FailedTransactionMetadata) {
      throw new TxError(res.meta().logs(), String(res.err()) + " " + res.toString());
    }
    return res as TransactionMetadata;
  }
  async sendOk(ixs: (TransactionInstruction | Promise<TransactionInstruction>)[], signers: Keypair[]) {
    return this.send(ixs, signers);
  }
  /** Expects failure; returns the error name. */
  async sendErr(ixs: (TransactionInstruction | Promise<TransactionInstruction>)[], signers: Keypair[]): Promise<string> {
    try {
      await this.send(ixs, signers);
    } catch (e) {
      if (e instanceof TxError) return e.code;
      throw e;
    }
    throw new Error("transaction unexpectedly succeeded");
  }
  /** Serialized size of a legacy transaction carrying these instructions (for wallet headroom checks). */
  async txSize(ixs: (TransactionInstruction | Promise<TransactionInstruction>)[], signers: Keypair[]) {
    const tx = new Transaction();
    tx.recentBlockhash = this.svm.latestBlockhash();
    tx.feePayer = signers[0].publicKey;
    tx.add(...(await Promise.all(ixs)));
    tx.sign(...signers);
    return tx.serialize().length;
  }

  // ---------- program accounts ----------
  switchState(sw: PublicKey): SwitchState {
    const a = this.svm.getAccount(sw);
    if (!a) throw new Error("switch missing");
    return decodeSwitch(Buffer.from(a.data));
  }
  config() {
    return decodeConfig(Buffer.from(this.svm.getAccount(this.client.pda.config())!.data));
  }
  profile(owner: PublicKey) {
    return decodeProfile(Buffer.from(this.svm.getAccount(this.client.pda.profile(owner))!.data));
  }

  // ---------- tokens ----------
  async createMint(opts: {
    decimals?: number;
    token2022?: boolean;
    extensions?: ExtensionType[];
    transferFeeBps?: number;
    hookProgram?: PublicKey;
    defaultFrozen?: boolean;
    freezeAuthority?: boolean;
  } = {}) {
    const mint = Keypair.generate();
    const decimals = opts.decimals ?? 6;
    const programId = opts.token2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const exts = opts.extensions ?? [];
    const space = getMintLen(exts);
    const rent = Number(this.svm.minimumBalanceForRentExemption(BigInt(space)));
    const ixs: TransactionInstruction[] = [
      SystemProgram.createAccount({
        fromPubkey: this.admin.publicKey,
        newAccountPubkey: mint.publicKey,
        space,
        lamports: rent,
        programId,
      }),
    ];
    for (const e of exts) {
      if (e === ExtensionType.TransferFeeConfig)
        ixs.push(
          createInitializeTransferFeeConfigInstruction(
            mint.publicKey,
            this.admin.publicKey,
            this.admin.publicKey,
            opts.transferFeeBps ?? 100,
            BigInt("18446744073709551615"),
            programId,
          ),
        );
      if (e === ExtensionType.TransferHook)
        ixs.push(createInitializeTransferHookInstruction(mint.publicKey, this.admin.publicKey, opts.hookProgram ?? Keypair.generate().publicKey, programId));
      if (e === ExtensionType.NonTransferable) ixs.push(createInitializeNonTransferableMintInstruction(mint.publicKey, programId));
      if (e === ExtensionType.MintCloseAuthority)
        ixs.push(createInitializeMintCloseAuthorityInstruction(mint.publicKey, this.admin.publicKey, programId));
      if (e === ExtensionType.DefaultAccountState)
        ixs.push(
          createInitializeDefaultAccountStateInstruction(
            mint.publicKey,
            opts.defaultFrozen ? AccountState.Frozen : AccountState.Initialized,
            programId,
          ),
        );
    }
    ixs.push(
      createInitializeMint2Instruction(
        mint.publicKey,
        decimals,
        this.admin.publicKey,
        opts.freezeAuthority || opts.defaultFrozen ? this.admin.publicKey : null,
        programId,
      ),
    );
    await this.sendOk(ixs, [this.admin, mint]);
    return { mint: mint.publicKey, programId, decimals };
  }

  ata(mint: PublicKey, owner: PublicKey, programId = TOKEN_PROGRAM_ID) {
    return getAssociatedTokenAddressSync(mint, owner, true, programId);
  }

  async mintTo(m: { mint: PublicKey; programId: PublicKey }, owner: PublicKey, amount: bigint | number) {
    const ata = this.ata(m.mint, owner, m.programId);
    await this.sendOk(
      [
        createAssociatedTokenAccountIdempotentInstruction(this.admin.publicKey, ata, owner, m.mint, m.programId),
        createMintToInstruction(m.mint, ata, this.admin.publicKey, BigInt(amount), [], m.programId),
      ],
      [this.admin],
    );
    return ata;
  }

  async nft(owner: PublicKey, token2022 = false) {
    const m = await this.createMint({ decimals: 0, token2022 });
    const ata = await this.mintTo(m, owner, 1);
    await this.sendOk(
      [createSetAuthorityInstruction(m.mint, this.admin.publicKey, AuthorityType.MintTokens, null, [], m.programId)],
      [this.admin],
    );
    return { ...m, ata };
  }

  tokenAccount(addr: PublicKey) {
    const a = this.svm.getAccount(addr);
    if (!a || a.data.length < 165) return null;
    const owner = new PublicKey(a.owner);
    if (!owner.equals(TOKEN_PROGRAM_ID) && !owner.equals(TOKEN_2022_PROGRAM_ID)) return null;
    return unpackAccount(addr, { ...a, data: Buffer.from(a.data) } as never, new PublicKey(a.owner));
  }
  balance(addr: PublicKey): bigint {
    return this.tokenAccount(addr)?.amount ?? 0n;
  }

  approveOther(owner: Keypair, account: PublicKey, programId: PublicKey, amount: bigint) {
    return this.sendOk([createApproveInstruction(account, Keypair.generate().publicKey, owner.publicKey, amount, [], programId)], [owner]);
  }
  transferOut(owner: Keypair, from: PublicKey, mint: PublicKey, programId: PublicKey, amount: bigint) {
    const dest = this.ata(mint, this.admin.publicKey, programId);
    return this.sendOk(
      [
        createAssociatedTokenAccountIdempotentInstruction(owner.publicKey, dest, this.admin.publicKey, mint, programId),
        createTransferInstruction(from, dest, owner.publicKey, amount, [], programId),
      ],
      [owner],
    );
  }
  freeze(account: PublicKey, mint: PublicKey, programId: PublicKey) {
    return this.sendOk([createFreezeAccountInstruction(account, mint, this.admin.publicKey, [], programId)], [this.admin]);
  }
  closeTokenAccount(owner: Keypair, account: PublicKey, programId: PublicKey) {
    return this.sendOk([createCloseAccountInstruction(account, owner.publicKey, owner.publicKey, [], programId)], [owner]);
  }

  // ---------- switch helpers ----------
  async createSwitch(
    owner: Keypair,
    heirs: HeirInput[],
    opts: { intervalDays?: number; intervalSecs?: number; tier?: { holding: PublicKey; mint: PublicKey } | null } = {},
  ) {
    const prof = this.exists(this.client.pda.profile(owner.publicKey)) ? this.profile(owner.publicKey) : null;
    const id = prof?.nextId ?? 0;
    const intervalSecs = opts.intervalSecs ?? (opts.intervalDays ?? 30) * DAY;
    await this.sendOk(
      [this.client.createSwitch({ owner: owner.publicKey, id, intervalSecs, heirs, tier: opts.tier ?? null })],
      [owner],
    );
    return this.client.pda.switch(owner.publicKey, id);
  }

  /** Runs every execution step the keeper would, until nothing is left. */
  async execute(sw: PublicKey, payer: Keypair = this.keeper) {
    for (let round = 0; round < 64; round++) {
      const st = this.switchState(sw);
      const steps = await this.client.nextExecutionSteps(payer.publicKey, sw, st, this.now);
      if (steps.length === 0) return this.switchState(sw);
      await this.sendOk([steps[0].ix], [payer]);
    }
    throw new Error("execution did not finish");
  }
}

export const heirs = (...pairs: [PublicKey, number][]): HeirInput[] => pairs.map(([wallet, bps]) => ({ wallet, bps }));
export { ExtensionType, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID };
