import { AccountId, TokenId } from "@hashgraph/sdk";
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
];

const ERC20_ABI = ["function approve(address spender,uint256 amount) returns (bool)"];

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
  if (process.env.MOCK_HEDERA === "true") {
    throw new Error(
      "AtomicSwap live execution requires MOCK_HEDERA=false (mock execution is disabled)"
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

export async function executeTrade(trade: TradePayload): Promise<ExecutionResult> {
  if ((trade.buyToken ?? "HBAR").toUpperCase() !== "HBAR") {
    throw new Error("Only HBAR buy-side settlement is currently supported");
  }

  if (!Number.isFinite(trade.amount) || trade.amount <= 0) {
    throw new Error(`Invalid sell amount: ${trade.amount}`);
  }

  if (!Number.isFinite(trade.price) || trade.price <= 0) {
    throw new Error(`Invalid limit price: ${trade.price}`);
  }

  const config = resolveExecutionConfig();

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const userSigner = new ethers.Wallet(normaliseHexKey(config.userEvmKey), provider);
  const marketSigner = new ethers.Wallet(normaliseHexKey(config.marketEvmKey), provider);

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

  const requestedUserAddress = walletToEvmAddress(trade.wallet);
  if (requestedUserAddress.toLowerCase() !== userSigner.address.toLowerCase()) {
    throw new Error(
      `Trade wallet ${requestedUserAddress} does not match configured USER_EVM_KEY address ${userSigner.address}`
    );
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

  let initiateHash = "";
  let approveHash = "";
  let executeHash = "";
  let initiated = false;

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
    await initiateTx.wait();
    initiated = true;

    const tokenAsUser = new ethers.Contract(sellTokenAddress, ERC20_ABI, userSigner);
    const approveTx = await tokenAsUser.approve(
      config.atomicSwapAddress,
      sellAmountSmallestUnit
    );
    approveHash = approveTx.hash;
    await approveTx.wait();

    const executeTx = await atomicSwapAsUser.executeTrade(tradeId);
    executeHash = executeTx.hash;
    await executeTx.wait();
  } catch (error) {
    if (initiated) {
      try {
        const cancelTx = await atomicSwapAsMarket.cancelTrade(tradeId);
        await cancelTx.wait();
      } catch {
        // Best-effort rollback path; preserve original failure for caller.
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`AtomicSwap execution failed: ${message}`);
  }

  return {
    executed: true,
    transactionId: executeHash,
    settlement:
      `AtomicSwap settled on Hedera EVM` +
      ` | initiate=${initiateHash}` +
      ` | approve=${approveHash}` +
      ` | execute=${executeHash}`,
  };
}
