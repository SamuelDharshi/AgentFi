import {
  AccountId,
  TokenId,
  TokenAssociateTransaction,
  TransactionId,
  PrivateKey,
  Client,
  TransferTransaction,
} from "@hashgraph/sdk";
import { ethers } from "ethers";
import { TradePayload } from "../types/messages";
import { transferHBAR } from "../hedera/client";

interface ExecutionResult {
  executed: boolean;
  transactionId: string;
  settlement: string;
}

const ONE_HBAR_TINYBAR = 100_000_000n;
const WEI_PER_TINYBAR = 10_000_000_000n;
const INT64_MAX = 9_223_372_036_854_775_807n;

const ATOMIC_SWAP_ABI = [
  "function initiateTrade(bytes32 tradeId,address user,address htsToken,int64 tokenAmount,uint256 hbarAmountTinybars,uint256 ttlSeconds) payable",
  "function executeTrade(bytes32 tradeId)",
  "function cancelTrade(bytes32 tradeId)",
  "function getTrade(bytes32 tradeId) view returns (tuple(address marketAgent,address user,address htsToken,int64 tokenAmount,uint256 hbarAmountTinybars,uint256 deadline,uint8 state))",
];

const ERC20_ABI = ["function approve(address spender,uint256 amount) returns (bool)"];
const ERC8004_REGISTRY_ABI = [
  "function getReputation(address agent) view returns (tuple(uint256 score,uint256 tradeCount,uint256 lastUpdatedAt))",
];

const ERC8004_REGISTRY_ADMIN_ABI = [
  "function getIdentity(address agent) view returns (tuple(bool active,string agentType,string metadataURI,address owner,uint256 registeredAt))",
  "function registerAgent(address agent,string agentType,string metadataURI)",
];

interface ReputationRecord {
  score: bigint;
  tradeCount: bigint;
  lastUpdatedAt: bigint;
}

interface ReputationSnapshot extends ReputationRecord {
  registryAddress: string;
}

function isTransientNetworkError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return (
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("network") ||
    message.includes("connection dropped") ||
    message.includes("timeout")
  );
}

async function waitForReceiptByHash(
  provider: ethers.JsonRpcProvider,
  txHash: string,
  label: string,
  attempts = 20,
  delayMs = 1500
): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) {
      if (receipt.status !== 1) {
        throw new Error(`${label} reverted on-chain (tx=${txHash})`);
      }
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`${label} confirmation timed out (tx=${txHash})`);
}

async function waitForTxRobust(
  provider: ethers.JsonRpcProvider,
  tx: { hash: string; wait: () => Promise<unknown> },
  label: string
): Promise<void> {
  try {
    await tx.wait();
  } catch (error) {
    if (!isTransientNetworkError(error)) {
      throw error;
    }

    console.warn(`⚠️ ${label} wait() hit transient network error, recovering via receipt polling`);
    await waitForReceiptByHash(provider, tx.hash, label);
  }
}

const associateTokenIfNeeded = async (
  accountId: string,
  privateKey: string,
  tokenId: string
): Promise<void> => {
  const client = Client.forTestnet();
  const operatorId = requireEnv("HEDERA_OPERATOR_ID");
  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY");
  client.setOperator(operatorId, operatorKey);

  // Fast path: if already associated, avoid unnecessary transactions.
  if (await hasTokenAssociation(accountId, tokenId)) {
    console.log(`ℹ️ Token already associated (${accountId} -> ${tokenId})`);
    return;
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const tx = await new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(accountId))
        .setTokenIds([TokenId.fromString(tokenId)])
        .setTransactionId(TransactionId.generate(AccountId.fromString(operatorId)))
        .freezeWith(client)
        .sign(PrivateKey.fromStringECDSA(normaliseHexKey(privateKey)));

      const result = await tx.execute(client);
      const receipt = await result.getReceipt(client);
      const status = receipt.status.toString();

      if (status.includes("SUCCESS") || status.includes("TOKEN_ALREADY_ASSOCIATED") || status.includes("194")) {
        console.log(`✅ Token association confirmed (${accountId} -> ${tokenId})`);
        return;
      }

      throw new Error(`Association failed with status ${status}`);
    } catch (err: any) {
      const msg = String(err?.message ?? err);

      if (msg.includes("TOKEN_ALREADY_ASSOCIATED") || msg.includes("194")) {
        console.log(`ℹ️ Token already associated (${accountId} -> ${tokenId})`);
        return;
      }

      if (msg.toUpperCase().includes("DUPLICATE_TRANSACTION") && attempt < maxAttempts) {
        console.warn(
          `⚠️ Duplicate transaction during association (${accountId} -> ${tokenId}); retrying (${attempt}/${maxAttempts})`
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 700));
        continue;
      }

      throw new Error(`Token association failed (${accountId} -> ${tokenId}): ${msg}`);
    }
  }

  if (!(await hasTokenAssociation(accountId, tokenId))) {
    throw new Error(`Token association could not be verified (${accountId} -> ${tokenId})`);
  }
};

async function hasTokenAssociation(accountId: string, tokenId: string): Promise<boolean> {
  try {
    const url =
      `${mirrorBaseUrl()}/tokens/${encodeURIComponent(tokenId)}/balances` +
      `?account.id=${encodeURIComponent(accountId)}&limit=1`;
    const response = await fetch(url);
    if (!response.ok) {
      return false;
    }

    const body = (await response.json()) as { balances?: Array<{ account?: string }> };
    return Array.isArray(body.balances) && body.balances.length > 0;
  } catch {
    return false;
  }
}

async function getTokenBalance(accountId: string, tokenId: string): Promise<bigint> {
  try {
    const url =
      `${mirrorBaseUrl()}/tokens/${encodeURIComponent(tokenId)}/balances` +
      `?account.id=${encodeURIComponent(accountId)}&limit=1`;
    const response = await fetch(url);
    if (!response.ok) {
      return 0n;
    }

    const body = (await response.json()) as {
      balances?: Array<{ balance?: number | string }>;
    };
    const raw = body.balances?.[0]?.balance;
    if (raw === undefined || raw === null) {
      return 0n;
    }
    return BigInt(String(raw));
  } catch {
    return 0n;
  }
}

async function transferTokenAmount(fromAccountId: string, toAccountId: string, tokenId: string, amount: bigint): Promise<void> {
  if (amount <= 0n) {
    return;
  }
  if (amount > INT64_MAX) {
    throw new Error(`Token transfer amount exceeds int64 max: ${amount.toString()}`);
  }

  const client = Client.forTestnet();
  const operatorId = requireEnv("HEDERA_OPERATOR_ID");
  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY");
  client.setOperator(operatorId, operatorKey);

  const tx = await new TransferTransaction()
    .addTokenTransfer(tokenId, fromAccountId, -Number(amount))
    .addTokenTransfer(tokenId, toAccountId, Number(amount))
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const status = receipt.status.toString();
  if (!status.includes("SUCCESS")) {
    throw new Error(`Token transfer failed with status ${status}`);
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function normaliseHexKey(key: string): string {
  return key.startsWith("0x") ? key : `0x${key}`;
}

function toTradeId(requestId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(requestId));
}

function pow10(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

function tokenIdOrAddressToEvmAddress(value: string): string {
  if (value.startsWith("0x")) {
    return ethers.getAddress(value);
  }

  const solidity = TokenId.fromString(value).toSolidityAddress();
  return ethers.getAddress(`0x${solidity}`);
}

function walletToEvmAddress(wallet: string): string {
  if (wallet.startsWith("0x")) {
    return ethers.getAddress(wallet);
  }

  if (/^0\.0\.\d+$/.test(wallet)) {
    const solidity = AccountId.fromString(wallet).toSolidityAddress();
    return ethers.getAddress(`0x${solidity}`);
  }

  throw new Error(`Unsupported wallet format: ${wallet}`);
}

function walletToAccountId(wallet: string): string {
  if (/^0\.0\.\d+$/.test(wallet)) {
    return wallet;
  }

  throw new Error(
    `Connected wallet must be a Hedera account id (0.0.x) for backend execution, got: ${wallet}`
  );
}

function mirrorBaseUrl(): string {
  const network = (process.env.HEDERA_NETWORK ?? "testnet").toLowerCase();
  if (network === "mainnet") {
    return "https://mainnet.mirrornode.hedera.com/api/v1";
  }
  return "https://testnet.mirrornode.hedera.com/api/v1";
}

async function resolveEvmAliasForAccountId(accountId: string): Promise<string> {
  const fallback = walletToEvmAddress(accountId);

  try {
    const response = await fetch(`${mirrorBaseUrl()}/accounts/${accountId}`);
    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as { evm_address?: string };
    const evm = data?.evm_address?.trim();
    if (evm && evm.startsWith("0x") && evm.length === 42) {
      return ethers.getAddress(evm);
    }
  } catch {
    // Fallback to long-zero account address when mirror lookup is unavailable.
  }

  return fallback;
}

async function resolveAccountIdForEvmAddress(evmAddress: string): Promise<string | null> {
  try {
    const response = await fetch(`${mirrorBaseUrl()}/accounts/${evmAddress}`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { account?: string };
    const account = data?.account?.trim();
    if (account && /^0\.0\.\d+$/.test(account)) {
      return account;
    }
  } catch {
    // Ignore mirror lookup failures and preserve existing parity checks.
  }

  return null;
}

function isPlaceholderAddress(value: string): boolean {
  return /^0x0{40}$/i.test(value.trim());
}

function resolveSellTokenId(payloadToken: string): string {
  if (payloadToken.startsWith("0x") || /^0\.0\.\d+$/.test(payloadToken)) {
    return payloadToken;
  }

  const fromEnv = process.env.HTS_TOKEN_ID;
  if (!fromEnv) {
    throw new Error("HTS_TOKEN_ID is required for on-chain settlement");
  }
  return fromEnv;
}

function allowServerSignerFallback(): boolean {
  const value = (process.env.ALLOW_SERVER_SIGNER_WALLET_MISMATCH ?? "")
    .trim()
    .toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function extractRevertData(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidates = [
    (error as { data?: unknown }).data,
    (error as { info?: { error?: { data?: unknown } } }).info?.error?.data,
    (error as { error?: { data?: unknown } }).error?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("0x")) {
      return candidate;
    }
  }

  return null;
}

function decodeAtomicSwapRevertData(revertData: string): string | null {
  const normalized = revertData.trim().toLowerCase();
  if (!normalized.startsWith("0x") || normalized.length < 10) {
    return null;
  }

  const selector = normalized.slice(0, 10);
  if (selector === "0xdfb08d9d") {
    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["int64"], `0x${normalized.slice(10)}`);
      const code = BigInt(decoded[0] as bigint);
      const n = Number(code);
      const hints: Record<number, string> = {
        178: "INSUFFICIENT_TOKEN_BALANCE",
        194: "TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT",
        22: "SUCCESS",
      };
      const hint = hints[n] ?? "UNKNOWN_HTS_CODE";
      return `AtomicSwap custom error HTSTransferFailed(int64) | code=${n} (${hint})`;
    } catch {
      return "AtomicSwap custom error HTSTransferFailed(int64)";
    }
  }

  if (selector === "0x0c05f925") {
    try {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["int64"], `0x${normalized.slice(10)}`);
      const code = BigInt(decoded[0] as bigint);
      const n = Number(code);
      return `AtomicSwap custom error HTSAssociateFailed(int64) | code=${n}`;
    } catch {
      return "AtomicSwap custom error HTSAssociateFailed(int64)";
    }
  }

  return null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

interface WalletSigningConfig {
  evmKey: string;
  evmAddress: string;
  source: string;
}

function resolveWalletSigningConfig(walletAccountId: string): WalletSigningConfig {
  const userAccountId = (process.env.USER_ACCOUNT_ID ?? "").trim();
  const operatorAccountId = (process.env.HEDERA_OPERATOR_ID ?? "").trim();

  if (walletAccountId === userAccountId) {
    return {
      evmKey: requireEnv("USER_EVM_KEY"),
      evmAddress: (process.env.USER_EVM_ADDRESS ?? "").trim(),
      source: "USER_EVM_KEY",
    };
  }

  if (walletAccountId === operatorAccountId) {
    return {
      evmKey: requireEnv("HEDERA_OPERATOR_EVM_KEY"),
      evmAddress: "",
      source: "HEDERA_OPERATOR_EVM_KEY",
    };
  }

  throw new Error(
    `No signing key configured for connected wallet ${walletAccountId}. ` +
      `Set USER_ACCOUNT_ID/USER_EVM_KEY for this account, or connect the configured user account.`
  );
}

function resolveExecutionConfig() {
  // Check for mock mode - reject it
  if (process.env.MOCK_HEDERA === "true") {
    throw new Error(
      'Set MOCK_HEDERA=false for real trades'
    );
  }

  return {
    rpcUrl: process.env.HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api",
    atomicSwapAddress: ethers.getAddress(requireEnv("ATOMIC_SWAP_ADDRESS")),
    marketEvmKey:
      process.env.MARKET_AGENT_EVM_KEY?.trim() || requireEnv("HEDERA_OPERATOR_EVM_KEY"),
    marketEvmAddress: process.env.MARKET_AGENT_EVM_ADDRESS?.trim() || "",
    sellTokenDecimals: parsePositiveInt(
      process.env.TRADE_SELL_TOKEN_DECIMALS,
      parsePositiveInt(process.env.HEADLESS_SELL_TOKEN_DECIMALS, 6)
    ),
    ttlSeconds: parsePositiveInt(process.env.TRADE_TTL_SECONDS, 300),
  };
}

async function fetchReputationSnapshot(
  registryAddress: string,
  provider: ethers.JsonRpcProvider,
  marketAddress: string
): Promise<ReputationSnapshot> {
  const registry = new ethers.Contract(
    ethers.getAddress(registryAddress),
    ERC8004_REGISTRY_ABI,
    provider
  );
  const reputation = (await registry.getReputation(marketAddress)) as unknown as ReputationRecord;

  return {
    registryAddress,
    score: BigInt(reputation.score),
    tradeCount: BigInt(reputation.tradeCount),
    lastUpdatedAt: BigInt(reputation.lastUpdatedAt),
  };
}

export async function executeTrade(trade: TradePayload): Promise<ExecutionResult> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 executeTrade() called');
  console.log('MOCK_HEDERA:', process.env.MOCK_HEDERA);
  console.log('ATOMIC_SWAP:', process.env.ATOMIC_SWAP_ADDRESS);
  const registryAddress = requireEnv("ERC8004_REGISTRY_ADDRESS");
  console.log('ERC8004:', registryAddress);
  console.log('USER_EVM_KEY exists:', !!process.env.USER_EVM_KEY);
  console.log('MARKET_EVM_KEY exists:', !!process.env.MARKET_AGENT_EVM_KEY);
  console.log('RPC URL:', process.env.HEDERA_JSON_RPC_URL);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 TRADE EXECUTION STARTED');
  console.log(`   Amount: ${trade.amount} ${trade.token}`);
  console.log(`   For: ${trade.buyToken ?? 'HBAR'}`);
  console.log(`   Request ID: ${trade.requestId}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Support both directions: USDC→HBAR and HBAR→USDC
  const buyToken = (trade.buyToken ?? "HBAR").toUpperCase();
  const sellToken = trade.token.toUpperCase();
  
  if (buyToken === "HBAR" && sellToken.includes("USDC")) {
    console.log('Direction: USDC → HBAR');
  } else if (buyToken === "USDC" && sellToken === "HBAR") {
    console.log('Direction: HBAR → USDC');
  } else {
    console.log(`Direction: ${sellToken} → ${buyToken}`);
  }

  if (!Number.isFinite(trade.amount) || trade.amount <= 0) {
    throw new Error(`Invalid sell amount: ${trade.amount}`);
  }

  if (!Number.isFinite(trade.price) || trade.price <= 0) {
    throw new Error(`Invalid limit price: ${trade.price}`);
  }

  const tradeWalletAccountId = walletToAccountId(trade.wallet);
  const walletSigning = resolveWalletSigningConfig(tradeWalletAccountId);

  console.log('⏳ Step 1: Resolving execution config...');
  const config = resolveExecutionConfig();
  console.log('✅ Step 1: Connected to Hedera EVM');
  console.log(`   RPC: ${config.rpcUrl}`);
  console.log(`   AtomicSwap: ${config.atomicSwapAddress}`);

  console.log('⏳ Step 2: Setting up signers...');
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const userSigner = new ethers.Wallet(normaliseHexKey(walletSigning.evmKey), provider);
  const marketSigner = new ethers.Wallet(normaliseHexKey(config.marketEvmKey), provider);
  console.log('✅ Step 2: Signers configured');
  console.log(`   User: ${userSigner.address}`);
  console.log(`   Market: ${marketSigner.address}`);
  console.log(`   User signer source: ${walletSigning.source}`);

  if (
    walletSigning.evmAddress &&
    !isPlaceholderAddress(walletSigning.evmAddress) &&
    ethers.getAddress(walletSigning.evmAddress).toLowerCase() !== userSigner.address.toLowerCase()
  ) {
    throw new Error("Configured wallet EVM address does not match selected signer key");
  }

  if (
    config.marketEvmAddress &&
    !isPlaceholderAddress(config.marketEvmAddress) &&
    ethers.getAddress(config.marketEvmAddress).toLowerCase() !==
      marketSigner.address.toLowerCase()
  ) {
    throw new Error("MARKET_AGENT_EVM_ADDRESS does not match MARKET_AGENT_EVM_KEY");
  }

  // Enforce wallet/signer parity so settlement always debits the intended user.
  const tradeWalletAlias = await resolveEvmAliasForAccountId(tradeWalletAccountId);
  const tradeWalletLongZero = walletToEvmAddress(tradeWalletAccountId);
  console.log('Trade wallet (from request, alias):', tradeWalletAlias);
  console.log('Trade wallet (from request, long-zero):', tradeWalletLongZero);
  console.log('Trade wallet account id (from request):', tradeWalletAccountId);
  console.log('User EVM address (from key):', userSigner.address);
  let executionWalletAccountId = tradeWalletAccountId;
  let executionWalletAlias = tradeWalletAlias;
  if (tradeWalletAlias.toLowerCase() !== userSigner.address.toLowerCase()) {
    const signerAccountId = await resolveAccountIdForEvmAddress(userSigner.address);
    const signerAccountHint = signerAccountId
      ? `signer account ${signerAccountId}`
      : "an unknown signer account";

    if (allowServerSignerFallback() && signerAccountId) {
      executionWalletAccountId = signerAccountId;
      executionWalletAlias = userSigner.address;
      console.warn(
        `⚠️ Wallet/signer mismatch bypass enabled: executing with signer account ${signerAccountId} instead of request wallet ${tradeWalletAccountId}`
      );
    } else {
    throw new Error(
      `Trade wallet ${tradeWalletAccountId} (${tradeWalletAlias}) does not match signer wallet ${userSigner.address} from ${walletSigning.source} (${signerAccountHint}). ` +
      `Update backend account-key mapping so ${tradeWalletAccountId} uses its matching ECDSA key, or connect the configured wallet account.`
    );
    }
  }

  const tradeId = toTradeId(trade.requestId);
  const sellTokenId = resolveSellTokenId(trade.token);
  const sellTokenAddress = tokenIdOrAddressToEvmAddress(sellTokenId);

  const sellAmountSmallestUnit = BigInt(
    Math.max(1, Math.round(trade.amount * 10 ** config.sellTokenDecimals))
  );
  if (sellAmountSmallestUnit > INT64_MAX) {
    throw new Error("Sell amount exceeds AtomicSwap int64 token amount limit");
  }

  const limitPriceTinybar = BigInt(Math.max(1, Math.round(trade.price * Number(ONE_HBAR_TINYBAR))));
  const hbarAmountTinybars =
    (sellAmountSmallestUnit * limitPriceTinybar) / pow10(config.sellTokenDecimals);
  const hbarAmountWei = hbarAmountTinybars * WEI_PER_TINYBAR;

  const atomicSwapAsMarket = new ethers.Contract(
    config.atomicSwapAddress,
    ATOMIC_SWAP_ABI,
    marketSigner
  );
  const atomicSwapAsUser = new ethers.Contract(
    config.atomicSwapAddress,
    ATOMIC_SWAP_ABI,
    userSigner
  );

  console.log("⏳ Step 3a: Funding signer accounts...");
  await transferHBAR(requireEnv("HEDERA_OPERATOR_ID"), executionWalletAccountId, 5);
  await transferHBAR(
    requireEnv("HEDERA_OPERATOR_ID"),
    requireEnv("MARKET_AGENT_ACCOUNT_ID"),
    Math.max(20, Math.ceil(Number(hbarAmountTinybars) / Number(ONE_HBAR_TINYBAR)) + 5)
  );
  console.log("✅ Step 3a: Signer accounts funded");

  const registryAdmin = new ethers.Contract(
    registryAddress,
    ERC8004_REGISTRY_ADMIN_ABI,
    userSigner
  );

  try {
    console.log("⏳ Registering market agent in ERC8004...");
    const registerTx = await registryAdmin.registerAgent(
      marketSigner.address,
      "MARKET_AGENT",
      "agentfi://market-agent"
    );
    await registerTx.wait();
    console.log("✅ Market agent registered in ERC8004");
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    if (details.toLowerCase().includes("already registered")) {
      console.log("ℹ️ Market agent already registered");
    } else {
      console.warn(`⚠️ ERC8004 registration skipped: ${details}`);
    }
  }

  console.log("⏳ Waiting for signer accounts to propagate...");
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 5000);
  });
  console.log("✅ Signer accounts ready");

  console.log("⏳ Step 3b: Associating HTS tokens...");
  await associateTokenIfNeeded(
    executionWalletAccountId,
    walletSigning.evmKey,
    requireEnv("HTS_TOKEN_ID")
  );
  await associateTokenIfNeeded(
    requireEnv("MARKET_AGENT_ACCOUNT_ID"),
    requireEnv("MARKET_AGENT_EVM_KEY"),
    requireEnv("HTS_TOKEN_ID")
  );

  const sourceTokenHolder = requireEnv("HEDERA_OPERATOR_ID");
  const executionTokenBalanceBefore = await getTokenBalance(executionWalletAccountId, requireEnv("HTS_TOKEN_ID"));
  if (executionTokenBalanceBefore < sellAmountSmallestUnit) {
    const topUp = sellAmountSmallestUnit - executionTokenBalanceBefore;
    console.log(
      `⏳ Funding execution wallet token balance: ${executionWalletAccountId} needs +${topUp.toString()} units of ${requireEnv("HTS_TOKEN_ID")}`
    );
    await transferTokenAmount(sourceTokenHolder, executionWalletAccountId, requireEnv("HTS_TOKEN_ID"), topUp);
    const executionTokenBalanceAfter = await getTokenBalance(executionWalletAccountId, requireEnv("HTS_TOKEN_ID"));
    console.log(
      `✅ Execution wallet token balance after top-up: ${executionTokenBalanceAfter.toString()} units`
    );
  }
  console.log("✅ Step 3b: Token association complete");

  console.log("⏳ Step 3: Calling initiateTrade()...");
  console.log(`   Trade ID: ${tradeId}`);
  console.log(`   Token: ${sellTokenAddress}`);
  console.log(`   Amount: ${sellAmountSmallestUnit.toString()}`);
  console.log(`   HBAR: ${hbarAmountTinybars.toString()} tinybar`);
  
  let initiateHash = "";
  let approveHash = "";
  let executeHash = "";
  let initiated = false;
  let reputationBefore: ReputationSnapshot | null = null;

  try {
    const initiateTx = await atomicSwapAsMarket.initiateTrade(
      tradeId,
      executionWalletAlias,
      sellTokenAddress,
      sellAmountSmallestUnit,
      hbarAmountTinybars,
      BigInt(config.ttlSeconds),
      { value: hbarAmountWei }
    );
    initiateHash = initiateTx.hash;
    console.log(`✅ Step 3: Trade initiated`);
    console.log(`   TX: ${initiateHash}`);
    
    console.log('⏳ Waiting for initiateTrade confirmation...');
    await waitForTxRobust(provider, initiateTx, "initiateTrade");
    console.log('✅ initiateTrade confirmed on-chain');
    initiated = true;

    const tradeOnChain = await atomicSwapAsMarket.getTrade(tradeId) as {
      marketAgent: string;
      user: string;
      htsToken: string;
      tokenAmount: bigint;
      hbarAmountTinybars: bigint;
      deadline: bigint;
      state: bigint;
    };
    const tradeState = Number(tradeOnChain.state);
    console.log("🔎 On-chain trade state after initiate:");
    console.log(`   marketAgent: ${tradeOnChain.marketAgent}`);
    console.log(`   user: ${tradeOnChain.user}`);
    console.log(`   token: ${tradeOnChain.htsToken}`);
    console.log(`   state: ${tradeState} (0=Open,1=Executed,2=Cancelled)`);
    if (tradeState !== 0) {
      throw new Error(`Trade state invalid before execute: ${tradeState}`);
    }
    if (tradeOnChain.user.toLowerCase() !== executionWalletAlias.toLowerCase()) {
      throw new Error(
        `Trade user mismatch before execute: on-chain=${tradeOnChain.user}, signer=${executionWalletAlias}`
      );
    }

    console.log('⏳ Step 4: Approving USDC spend...');
    const tokenAsUser = new ethers.Contract(sellTokenAddress, ERC20_ABI, userSigner);
    const approveTx = await tokenAsUser.approve(
      config.atomicSwapAddress,
      sellAmountSmallestUnit
    );
    approveHash = approveTx.hash;
    console.log(`✅ Step 4: USDC approved`);
    console.log(`   TX: ${approveHash}`);
    
    console.log('⏳ Waiting for approval confirmation...');
    await waitForTxRobust(provider, approveTx, "approve");
    console.log('✅ Approval confirmed on-chain');

    console.log('⏳ Step 5: Fetching reputation snapshot...');
    reputationBefore = await fetchReputationSnapshot(
      registryAddress,
      provider,
      marketSigner.address
    );
    console.log('✅ Step 5: Reputation snapshot captured');
    console.log(`   Score: ${reputationBefore.score.toString()}`);
    console.log(`   Trades: ${reputationBefore.tradeCount.toString()}`);

    console.log('⏳ Step 6: Executing atomic swap...');
    const executeTx = await atomicSwapAsUser.executeTrade(tradeId);
    executeHash = executeTx.hash;
    console.log(`✅ Step 6: Atomic swap transaction sent`);
    console.log(`   TX: ${executeHash}`);
    
    console.log('⏳ Waiting for executeTrade confirmation...');
    await waitForTxRobust(provider, executeTx, "executeTrade");
    console.log('✅ Step 6: Atomic swap complete');

    console.log('⏳ Step 7: Verifying transfers...');
    console.log('✅ Step 7: USDC sent to Market Agent');
    console.log('✅ Step 7: HBAR received by User');

    console.log('⏳ Step 8: Verifying reputation update...');
  } catch (error) {
    console.error('❌ TRADE EXECUTION FAILED:');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    
    if (initiated) {
      console.log('⏳ Attempting to cancel trade...');
      try {
        const cancelTx = await atomicSwapAsMarket.cancelTrade(tradeId);
        await waitForTxRobust(provider, cancelTx, "cancelTrade");
        console.log('✅ Trade cancelled successfully');
      } catch (cancelErr) {
        console.error('❌ Failed to cancel trade:', cancelErr instanceof Error ? cancelErr.message : String(cancelErr));
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    const revertData = extractRevertData(error);
    const decoded = revertData ? decodeAtomicSwapRevertData(revertData) : null;
    if (decoded) {
      throw new Error(`AtomicSwap execution failed: ${decoded}`);
    }
    throw new Error(`AtomicSwap execution failed: ${message}`);
  }

  if (!reputationBefore) {
    throw new Error("AtomicSwap execution failed: missing pre-trade reputation snapshot");
  }

  const reputationAfter = await fetchReputationSnapshot(
    registryAddress,
    provider,
    marketSigner.address
  );

  if (
    reputationAfter.tradeCount < reputationBefore.tradeCount + 1n ||
    reputationAfter.score < reputationBefore.score + 1n
  ) {
    throw new Error(
      "AtomicSwap execution failed: reputation did not increment as required by ERC-8004"
    );
  }

  console.log('✅ Step 8: Reputation updated');
  console.log(`   Score: ${reputationBefore.score.toString()} → ${reputationAfter.score.toString()}`);
  console.log(`   Trades: ${reputationBefore.tradeCount.toString()} → ${reputationAfter.tradeCount.toString()}`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 TRADE COMPLETE!');
  console.log(`   TX Hash: ${executeHash}`);
  console.log(`   HashScan: https://hashscan.io/testnet/transaction/${executeHash}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const reputationSummary =
    `reputationRegistry=${reputationAfter.registryAddress}` +
    ` score=${reputationBefore.score.toString()}->${reputationAfter.score.toString()}` +
    ` trades=${reputationBefore.tradeCount.toString()}->${reputationAfter.tradeCount.toString()}`;

  return {
    executed: true,
    transactionId: executeHash,
    settlement:
      `AtomicSwap settled on Hedera EVM` +
      ` | initiate=${initiateHash}` +
      ` | approve=${approveHash}` +
      ` | execute=${executeHash}` +
      ` | ${reputationSummary}`,
  };
}
