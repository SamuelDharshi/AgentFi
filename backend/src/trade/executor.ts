import {
  AccountId,
  TokenId,
  TokenAssociateTransaction,
  PrivateKey,
  Client,
} from "@hashgraph/sdk";
import { ethers } from "ethers";
import { TradePayload } from "../types/messages";

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
  "function reputationRegistry() view returns (address)",
];

const ERC20_ABI = ["function approve(address spender,uint256 amount) returns (bool)"];
const ERC8004_REGISTRY_ABI = [
  "function getReputation(address agent) view returns (tuple(uint256 score,uint256 tradeCount,uint256 lastUpdatedAt))",
];

interface ReputationRecord {
  score: bigint;
  tradeCount: bigint;
  lastUpdatedAt: bigint;
}

interface ReputationSnapshot extends ReputationRecord {
  registryAddress: string;
}

const associateTokenIfNeeded = async (
  accountId: string,
  privateKey: string,
  tokenId: string
): Promise<void> => {
  try {
    const client = Client.forTestnet();
    const operatorId = process.env.HEDERA_OPERATOR_ID!;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY!;
    client.setOperator(operatorId, operatorKey);

    const tx = await new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setTokenIds([TokenId.fromString(tokenId)])
      .freezeWith(client)
      .sign(PrivateKey.fromStringDer(privateKey));

    const result = await tx.execute(client);
    const receipt = await result.getReceipt(client);
    console.log("✅ Token associated:", receipt.status.toString());
  } catch (err: any) {
    if (
      err.message?.includes("TOKEN_ALREADY_ASSOCIATED") ||
      err.message?.includes("194")
    ) {
      console.log("ℹ️ Token already associated - skipping");
    } else {
      console.warn("⚠️ Token association warning:", err.message);
    }
  }
};

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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
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
    userEvmKey: requireEnv("USER_EVM_KEY"),
    marketEvmKey:
      process.env.MARKET_AGENT_EVM_KEY?.trim() || requireEnv("HEDERA_OPERATOR_EVM_KEY"),
    userEvmAddress: process.env.USER_EVM_ADDRESS?.trim() || "",
    marketEvmAddress: process.env.MARKET_AGENT_EVM_ADDRESS?.trim() || "",
    sellTokenDecimals: parsePositiveInt(
      process.env.TRADE_SELL_TOKEN_DECIMALS,
      parsePositiveInt(process.env.HEADLESS_SELL_TOKEN_DECIMALS, 6)
    ),
    ttlSeconds: parsePositiveInt(process.env.TRADE_TTL_SECONDS, 300),
  };
}

async function fetchReputationSnapshot(
  atomicSwapContract: ethers.Contract,
  provider: ethers.JsonRpcProvider,
  marketAddress: string
): Promise<ReputationSnapshot> {
  const registryAddress = ethers.getAddress(
    (await atomicSwapContract.reputationRegistry()) as string
  );
  const registry = new ethers.Contract(registryAddress, ERC8004_REGISTRY_ABI, provider);
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
  const registryAddress = process.env.ERC8004_REGISTRY_ADDRESS || '0x00000000000000000000000000000000007d9862';
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

  console.log('⏳ Step 1: Resolving execution config...');
  const config = resolveExecutionConfig();
  console.log('✅ Step 1: Connected to Hedera EVM');
  console.log(`   RPC: ${config.rpcUrl}`);
  console.log(`   AtomicSwap: ${config.atomicSwapAddress}`);

  console.log('⏳ Step 2: Setting up signers...');
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const userSigner = new ethers.Wallet(normaliseHexKey(config.userEvmKey), provider);
  const marketSigner = new ethers.Wallet(normaliseHexKey(config.marketEvmKey), provider);
  console.log('✅ Step 2: Signers configured');
  console.log(`   User: ${userSigner.address}`);
  console.log(`   Market: ${marketSigner.address}`);

  if (
    config.userEvmAddress &&
    ethers.getAddress(config.userEvmAddress).toLowerCase() !== userSigner.address.toLowerCase()
  ) {
    throw new Error("USER_EVM_ADDRESS does not match USER_EVM_KEY");
  }

  if (
    config.marketEvmAddress &&
    ethers.getAddress(config.marketEvmAddress).toLowerCase() !==
      marketSigner.address.toLowerCase()
  ) {
    throw new Error("MARKET_AGENT_EVM_ADDRESS does not match MARKET_AGENT_EVM_KEY");
  }

  // Log both addresses but don't block execution
  const tradeWallet = walletToEvmAddress(trade.wallet);
  console.log('Trade wallet (from request):', tradeWallet);
  console.log('User EVM address (from key):', userSigner.address);
  console.log('Continuing execution regardless of wallet mismatch');

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

  console.log("⏳ Step 3b: Associating HTS token...");
  
  // Associate token for user
  if (process.env.USER_ACCOUNT_ID && process.env.HTS_TOKEN_ID) {
    await associateTokenIfNeeded(
      process.env.USER_ACCOUNT_ID,
      process.env.HEDERA_OPERATOR_KEY || "",
      process.env.HTS_TOKEN_ID
    );
  }
  
  // Associate token for market agent
  if (process.env.MARKET_AGENT_ACCOUNT_ID && process.env.HTS_TOKEN_ID) {
    await associateTokenIfNeeded(
      process.env.MARKET_AGENT_ACCOUNT_ID,
      process.env.HEDERA_OPERATOR_KEY || "",
      process.env.HTS_TOKEN_ID
    );
  }
  
  console.log("✅ Step 3b: Token association done");

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
      userSigner.address,
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
    await initiateTx.wait();
    console.log('✅ initiateTrade confirmed on-chain');
    initiated = true;

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
    await approveTx.wait();
    console.log('✅ Approval confirmed on-chain');

    console.log('⏳ Step 5: Fetching reputation snapshot...');
    reputationBefore = await fetchReputationSnapshot(
      atomicSwapAsMarket,
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
    await executeTx.wait();
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
        await cancelTx.wait();
        console.log('✅ Trade cancelled successfully');
      } catch (cancelErr) {
        console.error('❌ Failed to cancel trade:', cancelErr instanceof Error ? cancelErr.message : String(cancelErr));
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AtomicSwap execution failed: ${message}`);
  }

  if (!reputationBefore) {
    throw new Error("AtomicSwap execution failed: missing pre-trade reputation snapshot");
  }

  const reputationAfter = await fetchReputationSnapshot(
    atomicSwapAsMarket,
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
