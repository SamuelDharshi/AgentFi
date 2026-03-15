import crypto from "crypto";
import dotenv from "dotenv";
import { ethers } from "ethers";
import {
  Client,
  PrivateKey,
  TokenId,
  TopicCreateTransaction,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { buildCheckoutProposal, publishProposal } from "../hcs/ucpBus";
import {
  CheckoutEnvelope,
  UCP_ACCEPT,
  UCP_CHECKOUT,
  UcpEnvelope,
} from "../types/ucp";

dotenv.config();

const ATOMIC_SWAP_ABI = [
  "function initiateTrade(bytes32 tradeId,address user,address htsToken,int64 tokenAmount,uint256 hbarAmountTinybars,uint256 ttlSeconds) payable",
  "function executeTrade(bytes32 tradeId)",
];

const ERC20_ABI = ["function approve(address spender,uint256 amount) returns (bool)"];

const WEI_PER_TINYBAR = 10_000_000_000n;
const INT64_MAX = 9_223_372_036_854_775_807n;

type FlowState = "Discovering" | "Negotiating" | "Executing" | "Settled";

interface AcceptPayload {
  requestId: string;
  accepted: boolean;
  marketAccountId: string;
  marketAddress: string;
  requiredHbarTinybars: string;
  reason?: string;
}

interface ParsedUcpMessage {
  envelope: UcpEnvelope<unknown>;
  consensusTimestamp: string;
  sequenceNumber: string;
  signatureVerified: boolean;
}

interface HeadlessConfig {
  network: string;
  operatorId: string;
  operatorKey: string;
  topicId?: string;
  mirrorNodeApiBaseUrl: string;
  jsonRpcUrl: string;
  atomicSwapAddress: string;
  htsTokenId: string;
  userAccountId: string;
  userEvmAddress?: string;
  userEvmKey: string;
  marketAccountId: string;
  marketEvmAddress?: string;
  marketEvmKey: string;
  sellAmountSmallestUnit: bigint;
  sellTokenDecimals: number;
  limitPriceTinybarPerToken: bigint;
  slippageBps: number;
  ttlSeconds: number;
  timeoutMs: number;
}

interface ExecutionResult {
  tradeId: string;
  initiateTxHash: string;
  approveTxHash: string;
  executeTxHash: string;
}

function logState(state: FlowState, message: string): void {
  // Keep logs machine-friendly for CLI monitoring and demos.
  console.log(`[${new Date().toISOString()}] [${state}] ${message}`);
}

function normaliseHexKey(key: string): string {
  return key.startsWith("0x") ? key : `0x${key}`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parsePositiveBigInt(value: string | undefined, fallback: bigint): bigint {
  if (!value) return fallback;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseLimitPriceTinybar(): bigint {
  const asTinybar = process.env.HEADLESS_LIMIT_PRICE_TINYBAR;
  if (asTinybar) {
    return parsePositiveBigInt(asTinybar, 8_500_000n);
  }

  const asHbar = process.env.HEADLESS_LIMIT_PRICE_HBAR;
  if (asHbar) {
    const parsed = Number(asHbar);
    if (Number.isFinite(parsed) && parsed > 0) {
      return BigInt(Math.max(1, Math.round(parsed * 100_000_000)));
    }
  }

  return 8_500_000n; // 0.085 HBAR per full token as safe default.
}

function pow10(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

function calculateRequiredHbarTinybars(
  sellAmountSmallestUnit: bigint,
  limitPriceTinybarPerToken: bigint,
  sellTokenDecimals: number
): bigint {
  return (sellAmountSmallestUnit * limitPriceTinybarPerToken) / pow10(sellTokenDecimals);
}

function tokenIdToAddress(tokenIdOrAddress: string): string {
  if (tokenIdOrAddress.startsWith("0x")) {
    return ethers.getAddress(tokenIdOrAddress);
  }

  const solidity = TokenId.fromString(tokenIdOrAddress).toSolidityAddress();
  return ethers.getAddress(`0x${solidity}`);
}

function canonical<T>(envelope: UcpEnvelope<T>): string {
  const { signature: _omit, ...rest } = envelope as unknown as Record<string, unknown>;
  return JSON.stringify(rest);
}

const messageEncryptionKey =
  process.env.MESSAGE_ENCRYPTION_KEY || "agentfi-local-encryption-key-32bytes";

function encryptionKeyBuffer(): Buffer {
  return crypto.createHash("sha256").update(messageEncryptionKey).digest();
}

function decryptMaybe(text: string): string {
  try {
    const data = Buffer.from(text, "base64");
    if (data.length < 29) {
      return text;
    }

    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKeyBuffer(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUcpEnvelope(value: unknown): value is UcpEnvelope<unknown> {
  if (!isRecord(value)) return false;
  return (
    typeof value.capability === "string" &&
    typeof value.version === "string" &&
    typeof value.id === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.sender === "string" &&
    typeof value.signature === "string" &&
    "payload" in value
  );
}

async function publishSignedEnvelope<T>(
  client: Client,
  topicId: string,
  envelope: UcpEnvelope<T>,
  signerPrivateKeyHex: string
): Promise<UcpEnvelope<T>> {
  const wallet = new ethers.Wallet(normaliseHexKey(signerPrivateKeyHex));
  const canonicalEnvelope: UcpEnvelope<T> = {
    ...envelope,
    sender: wallet.address,
    signature: "",
  };

  const signature = await wallet.signMessage(canonical(canonicalEnvelope));
  const signed: UcpEnvelope<T> = {
    ...canonicalEnvelope,
    signature,
  };

  await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(signed))
    .execute(client);

  return signed;
}

function subscribeUcpMessages(
  client: Client,
  topicId: string,
  startTime: Date,
  onMessage: (msg: ParsedUcpMessage) => Promise<void>,
  onError: (err: Error) => void
): void {
  const query = new TopicMessageQuery().setTopicId(topicId).setStartTime(startTime);

  query.subscribe(
    client,
    (err) => {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      onError(wrapped);
    },
    (rawMsg) => {
      if (!rawMsg?.contents) return;

      const secs = rawMsg.consensusTimestamp?.seconds?.toString() ?? "0";
      const nanosRaw = rawMsg.consensusTimestamp?.nanos;
      const nanos = String(
        typeof nanosRaw === "number"
          ? nanosRaw
          : (nanosRaw as { toNumber?: () => number })?.toNumber?.() ?? 0
      ).padStart(9, "0");

      const consensusTimestamp = `${secs}.${nanos}`;
      const sequenceNumber = rawMsg.sequenceNumber?.toString() ?? "0";
      const rawText = Buffer.from(rawMsg.contents).toString("utf8");
      const text = decryptMaybe(rawText);

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }

      if (!isUcpEnvelope(parsed)) {
        return;
      }

      let signatureVerified = false;
      try {
        const body = canonical(parsed);
        const recovered = ethers.verifyMessage(body, parsed.signature);
        signatureVerified = recovered.toLowerCase() === parsed.sender.toLowerCase();
      } catch {
        signatureVerified = false;
      }

      void onMessage({
        envelope: parsed,
        consensusTimestamp,
        sequenceNumber,
        signatureVerified,
      }).catch(onError);
    }
  );
}

async function getAccountHbarTinybar(
  mirrorNodeApiBaseUrl: string,
  accountId: string
): Promise<bigint> {
  const base = mirrorNodeApiBaseUrl.endsWith("/")
    ? mirrorNodeApiBaseUrl.slice(0, -1)
    : mirrorNodeApiBaseUrl;
  const url = `${base}/accounts/${accountId}`;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mirror node account query failed ${response.status}: ${body}`);
  }

  const json = (await response.json()) as {
    balance?: { balance?: number | string };
  };

  const balance = json.balance?.balance;
  if (balance === undefined) {
    throw new Error(`Mirror node response missing balance for ${accountId}`);
  }

  return BigInt(String(balance));
}

function loadConfigFromEnv(): HeadlessConfig {
  const network = (process.env.HEDERA_NETWORK ?? "testnet").toLowerCase();
  if (network !== "testnet") {
    throw new Error("Phase 4 headless loop is restricted to Hedera testnet only");
  }

  if (process.env.MOCK_HEDERA === "true") {
    throw new Error("Phase 4 headless loop requires MOCK_HEDERA=false");
  }

  return {
    network,
    operatorId: requireEnv("HEDERA_OPERATOR_ID"),
    operatorKey: requireEnv("HEDERA_OPERATOR_KEY"),
    topicId: process.env.HEDERA_TOPIC_ID?.trim() || undefined,
    mirrorNodeApiBaseUrl:
      process.env.MIRROR_NODE_API_BASE_URL ??
      "https://testnet.mirrornode.hedera.com/api/v1",
    jsonRpcUrl: process.env.HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api",
    atomicSwapAddress: requireEnv("ATOMIC_SWAP_ADDRESS"),
    htsTokenId: requireEnv("HTS_TOKEN_ID"),
    userAccountId: requireEnv("USER_ACCOUNT_ID"),
    userEvmAddress: process.env.USER_EVM_ADDRESS?.trim() || undefined,
    userEvmKey: requireEnv("USER_EVM_KEY"),
    marketAccountId: requireEnv("MARKET_AGENT_ACCOUNT_ID"),
    marketEvmAddress: process.env.MARKET_AGENT_EVM_ADDRESS?.trim() || undefined,
    marketEvmKey:
      process.env.MARKET_AGENT_EVM_KEY?.trim() || requireEnv("HEDERA_OPERATOR_EVM_KEY"),
    sellAmountSmallestUnit: parsePositiveBigInt(
      process.env.HEADLESS_SELL_AMOUNT_SMALLEST,
      parsePositiveBigInt(process.env.OPENCLAW_SELL_AMOUNT_SMALLEST, 1_000_000n)
    ),
    sellTokenDecimals: parsePositiveInt(process.env.HEADLESS_SELL_TOKEN_DECIMALS, 6),
    limitPriceTinybarPerToken: parseLimitPriceTinybar(),
    slippageBps: parsePositiveInt(process.env.HEADLESS_SLIPPAGE_BPS, 50),
    ttlSeconds: parsePositiveInt(process.env.HEADLESS_TTL_SECONDS, 300),
    timeoutMs: parsePositiveInt(process.env.HEADLESS_TIMEOUT_MS, 180_000),
  };
}

function createHederaClient(config: HeadlessConfig): Client {
  const client =
    config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(config.operatorId, PrivateKey.fromStringDer(config.operatorKey));
  return client;
}

async function ensureTopicId(client: Client, topicId: string | undefined): Promise<string> {
  if (topicId) {
    return topicId;
  }

  const tx = await new TopicCreateTransaction()
    .setTopicMemo("AgentFi Headless Orchestration Topic")
    .execute(client);
  const receipt = await tx.getReceipt(client);

  if (!receipt.topicId) {
    throw new Error("Failed to create HCS topic for headless orchestration loop");
  }

  return receipt.topicId.toString();
}

function assertAddressMatch(
  label: string,
  expectedAddress: string | undefined,
  derivedAddress: string
): void {
  if (!expectedAddress) return;
  if (expectedAddress.toLowerCase() !== derivedAddress.toLowerCase()) {
    throw new Error(
      `${label} mismatch: env=${expectedAddress} derived=${derivedAddress}. ` +
        `Use the private key for the configured address.`
    );
  }
}

function toTradeId(requestId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(requestId));
}

async function executeAtomicSwapFlow(
  config: HeadlessConfig,
  requestEnvelope: CheckoutEnvelope,
  marketWallet: ethers.Wallet,
  userWallet: ethers.Wallet,
  atomicSwapAddress: string
): Promise<ExecutionResult> {
  const atomicSwapAsMarket = new ethers.Contract(
    atomicSwapAddress,
    ATOMIC_SWAP_ABI,
    marketWallet
  );
  const atomicSwapAsUser = new ethers.Contract(
    atomicSwapAddress,
    ATOMIC_SWAP_ABI,
    userWallet
  );

  const tokenAmount = BigInt(requestEnvelope.payload.sellAmount);
  if (tokenAmount <= 0n || tokenAmount > INT64_MAX) {
    throw new Error(
      `sellAmount out of int64 bounds for AtomicSwap: ${requestEnvelope.payload.sellAmount}`
    );
  }

  const limitPrice = BigInt(requestEnvelope.payload.limitPrice);
  const hbarAmountTinybars = calculateRequiredHbarTinybars(
    tokenAmount,
    limitPrice,
    config.sellTokenDecimals
  );
  const hbarAmountWei = hbarAmountTinybars * WEI_PER_TINYBAR;
  const tokenAddress = tokenIdToAddress(requestEnvelope.payload.sellToken);
  const tradeId = toTradeId(requestEnvelope.payload.requestId);
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds =
    requestEnvelope.payload.expiry > now
      ? requestEnvelope.payload.expiry - now
      : config.ttlSeconds;

  const initiateTx = await atomicSwapAsMarket.initiateTrade(
    tradeId,
    userWallet.address,
    tokenAddress,
    tokenAmount,
    hbarAmountTinybars,
    BigInt(ttlSeconds),
    {
      value: hbarAmountWei,
    }
  );
  await initiateTx.wait();

  const tokenAsUser = new ethers.Contract(tokenAddress, ERC20_ABI, userWallet);
  const approveTx = await tokenAsUser.approve(atomicSwapAddress, tokenAmount);
  await approveTx.wait();

  const executeTx = await atomicSwapAsUser.executeTrade(tradeId);
  await executeTx.wait();

  return {
    tradeId,
    initiateTxHash: initiateTx.hash,
    approveTxHash: approveTx.hash,
    executeTxHash: executeTx.hash,
  };
}

async function runHeadlessLoop(): Promise<void> {
  const config = loadConfigFromEnv();

  logState("Discovering", `Bootstrapping Phase 4 loop on ${config.network}`);

  const client = createHederaClient(config);
  const provider = new ethers.JsonRpcProvider(config.jsonRpcUrl);
  const userWallet = new ethers.Wallet(normaliseHexKey(config.userEvmKey), provider);
  const marketWallet = new ethers.Wallet(normaliseHexKey(config.marketEvmKey), provider);

  assertAddressMatch("USER_EVM_ADDRESS", config.userEvmAddress, userWallet.address);
  assertAddressMatch(
    "MARKET_AGENT_EVM_ADDRESS",
    config.marketEvmAddress,
    marketWallet.address
  );

  const atomicSwapAddress = ethers.getAddress(config.atomicSwapAddress);
  const topicId = await ensureTopicId(client, config.topicId);
  if (!config.topicId) {
    logState("Discovering", `Created HCS topic ${topicId}`);
  } else {
    logState("Discovering", `Using existing HCS topic ${topicId}`);
  }

  let completionDone = false;
  const startedAt = new Date();
  const requestId = `headless-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const checkout = buildCheckoutProposal(
    {
      requestId,
      initiatorAccount: config.userAccountId,
      sellToken: config.htsTokenId,
      sellAmountSmallestUnit: config.sellAmountSmallestUnit,
      buyToken: "HBAR",
      limitPriceSmallestUnit: config.limitPriceTinybarPerToken,
      slippageBps: config.slippageBps,
      ttlSeconds: config.ttlSeconds,
      escrowContract: atomicSwapAddress,
    },
    userWallet.address
  );

  const completion = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (completionDone) return;
      completionDone = true;
      reject(new Error(`Timed out waiting for settled state after ${config.timeoutMs}ms`));
    }, config.timeoutMs);

    const fail = (err: Error): void => {
      if (completionDone) return;
      completionDone = true;
      clearTimeout(timeout);
      reject(err);
    };

    const succeed = (): void => {
      if (completionDone) return;
      completionDone = true;
      clearTimeout(timeout);
      resolve();
    };

    let acceptancePublished = false;
    let executionStarted = false;

    subscribeUcpMessages(
      client,
      topicId,
      startedAt,
      async (msg) => {
        if (!msg.signatureVerified) {
          return;
        }

        if (msg.envelope.capability === UCP_CHECKOUT) {
          const envelope = msg.envelope as CheckoutEnvelope;
          if (envelope.payload.requestId !== requestId) return;
          if (envelope.sender.toLowerCase() !== userWallet.address.toLowerCase()) return;
          if (acceptancePublished) return;

          logState(
            "Negotiating",
            `Market Agent received trade request seq=${msg.sequenceNumber} ts=${msg.consensusTimestamp}`
          );

          const requiredHbarTinybars = calculateRequiredHbarTinybars(
            BigInt(envelope.payload.sellAmount),
            BigInt(envelope.payload.limitPrice),
            config.sellTokenDecimals
          );

          const marketBalanceTinybars = await getAccountHbarTinybar(
            config.mirrorNodeApiBaseUrl,
            config.marketAccountId
          );

          const hasLiquidity = marketBalanceTinybars >= requiredHbarTinybars;
          const reason = hasLiquidity
            ? "Liquidity verified"
            : `Insufficient HBAR balance: ${marketBalanceTinybars} < ${requiredHbarTinybars}`;

          const acceptEnvelope: UcpEnvelope<AcceptPayload> = {
            capability: UCP_ACCEPT,
            version: "1.0",
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            sender: marketWallet.address,
            signature: "",
            payload: {
              requestId,
              accepted: hasLiquidity,
              marketAccountId: config.marketAccountId,
              marketAddress: marketWallet.address,
              requiredHbarTinybars: requiredHbarTinybars.toString(),
              reason,
            },
          };

          await publishSignedEnvelope(
            client,
            topicId,
            acceptEnvelope,
            config.marketEvmKey
          );

          acceptancePublished = true;
          logState(
            "Negotiating",
            `Market Agent broadcast acceptance accepted=${hasLiquidity} requestId=${requestId}`
          );

          if (!hasLiquidity) {
            fail(new Error(reason));
          }

          return;
        }

        if (msg.envelope.capability === UCP_ACCEPT) {
          if (executionStarted) return;

          const payload = msg.envelope.payload as Partial<AcceptPayload>;
          if (payload.requestId !== requestId) return;
          if (!payload.accepted) {
            fail(new Error(`Market Agent rejected trade request: ${payload.reason ?? "unknown"}`));
            return;
          }

          if (msg.envelope.sender.toLowerCase() !== marketWallet.address.toLowerCase()) {
            fail(
              new Error(
                `Acceptance sender mismatch: expected ${marketWallet.address}, got ${msg.envelope.sender}`
              )
            );
            return;
          }

          executionStarted = true;
          logState(
            "Executing",
            `Acceptance received seq=${msg.sequenceNumber}. Signing and submitting AtomicSwap transactions`
          );

          const result = await executeAtomicSwapFlow(
            config,
            checkout,
            marketWallet,
            userWallet,
            atomicSwapAddress
          );

          logState(
            "Settled",
            `tradeId=${result.tradeId} initiateTx=${result.initiateTxHash} approveTx=${result.approveTxHash} executeTx=${result.executeTxHash}`
          );

          succeed();
        }
      },
      fail
    );
  });

  logState("Negotiating", `User Agent broadcasting UCP checkout requestId=${requestId}`);
  await publishProposal(client, topicId, checkout, config.userEvmKey);

  await completion;
}

runHeadlessLoop()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] [Error] ${msg}`);
    process.exit(1);
  });
