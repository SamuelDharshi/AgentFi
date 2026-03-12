import crypto from "crypto";
import { Client } from "@hashgraph/sdk";
import {
  buildCheckoutProposal,
  publishProposal,
} from "../../hcs/ucpBus";
import { getHcsClient } from "../../hedera/client";
import { OpenClawSkill, OpenClawSkillContext } from "../types";

interface SaucerToken {
  id: string;
  symbol: string;
  decimals: number;
  priceUsd: number;
}

interface AccountResponse {
  balance?: {
    balance?: number | string;
  };
}

interface TokenBalanceResponse {
  balances?: Array<{
    balance?: number | string;
  }>;
}

export interface AutonomousTraderSkillConfig {
  enabled: boolean;
  heartbeatMs: number;
  // DEX market data source (SaucerSwap REST)
  saucerApiBaseUrl: string;
  saucerTokensPath: string;
  saucerApiKey?: string;
  // Hedera mirror for real balances
  mirrorNodeApiBaseUrl: string;
  // Trade accounts
  traderAccountId: string;
  traderEvmAddress: string;
  liquidityAccountId: string;
  signerEvmKey: string;
  // Trade configuration
  sellTokenId: string;
  buyToken: string;
  sellAmountSmallestUnit: bigint;
  maxSlippageBps: number;
  quoteDiscountBps: number;
  escrowContract: string;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parsePositiveBigInt(value: string | undefined, fallback: bigint): bigint {
  if (!value) return fallback;
  try {
    const n = BigInt(value);
    return n > 0n ? n : fallback;
  } catch {
    return fallback;
  }
}

function pow10(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

function toBigInt(value: number | string | undefined): bigint {
  if (value === undefined) return 0n;
  return BigInt(String(value));
}

function normaliseHexKey(key: string): string {
  return key.replace(/^0x/i, "");
}

function asUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}: ${body}`);
  }
  return (await res.json()) as T;
}

function parseSaucerTokens(raw: unknown): SaucerToken[] {
  const arr: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { tokens?: unknown[] })?.tokens)
      ? ((raw as { tokens?: unknown[] }).tokens as unknown[])
      : [];

  return arr
    .map((item) => {
      const t = item as {
        id?: string;
        symbol?: string;
        decimals?: number;
        priceUsd?: number | string;
      };
      return {
        id: String(t.id ?? ""),
        symbol: String(t.symbol ?? "").toUpperCase(),
        decimals: Number(t.decimals ?? 0),
        priceUsd: Number(t.priceUsd ?? 0),
      };
    })
    .filter(
      (t) =>
        Boolean(t.id) &&
        Boolean(t.symbol) &&
        Number.isFinite(t.priceUsd) &&
        t.priceUsd > 0 &&
        Number.isInteger(t.decimals) &&
        t.decimals >= 0
    );
}

function findToken(tokens: SaucerToken[], tokenOrSymbol: string): SaucerToken | null {
  const upper = tokenOrSymbol.toUpperCase();
  return (
    tokens.find((t) => t.id === tokenOrSymbol) ??
    tokens.find((t) => t.symbol === upper) ??
    null
  );
}

export function loadAutonomousTraderConfigFromEnv(): AutonomousTraderSkillConfig {
  const network = process.env.HEDERA_NETWORK ?? "testnet";
  const mirrorBase =
    process.env.MIRROR_NODE_API_BASE_URL ??
    (network === "mainnet"
      ? "https://mainnet-public.mirrornode.hedera.com/api/v1"
      : "https://testnet.mirrornode.hedera.com/api/v1");

  return {
    enabled: process.env.OPENCLAW_AUTONOMOUS === "true",
    heartbeatMs: parsePositiveInt(process.env.OPENCLAW_HEARTBEAT_MS, 60_000),
    saucerApiBaseUrl:
      process.env.SAUCERSWAP_API_BASE_URL ?? "https://test-server.saucerswap.finance",
    saucerTokensPath: process.env.SAUCERSWAP_TOKENS_PATH ?? "/tokens",
    saucerApiKey: process.env.SAUCERSWAP_API_KEY,
    mirrorNodeApiBaseUrl: mirrorBase,
    traderAccountId: process.env.OPENCLAW_TRADER_ACCOUNT_ID ?? process.env.MARKET_AGENT_ACCOUNT_ID ?? "",
    traderEvmAddress: process.env.OPENCLAW_TRADER_EVM_ADDRESS ?? process.env.MARKET_AGENT_EVM_ADDRESS ?? "",
    liquidityAccountId:
      process.env.OPENCLAW_LIQUIDITY_ACCOUNT_ID ?? process.env.LIQUIDITY_WALLET ?? "",
    signerEvmKey:
      process.env.OPENCLAW_SIGNER_EVM_KEY ?? process.env.HEDERA_OPERATOR_EVM_KEY ?? "",
    sellTokenId: process.env.OPENCLAW_SELL_TOKEN_ID ?? process.env.HTS_TOKEN_ID ?? "",
    buyToken: process.env.OPENCLAW_BUY_TOKEN ?? "HBAR",
    sellAmountSmallestUnit: parsePositiveBigInt(
      process.env.OPENCLAW_SELL_AMOUNT_SMALLEST,
      1_000_000n
    ),
    maxSlippageBps: parsePositiveInt(process.env.OPENCLAW_MAX_SLIPPAGE_BPS, 75),
    quoteDiscountBps: parsePositiveInt(process.env.OPENCLAW_QUOTE_DISCOUNT_BPS, 25),
    escrowContract: process.env.ATOMIC_SWAP_ADDRESS ?? "",
  };
}

export class AutonomousTraderSkill implements OpenClawSkill {
  readonly name = "openclaw.autonomous-trader";

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private tickInFlight = false;

  constructor(
    private readonly context: OpenClawSkillContext,
    private readonly config: AutonomousTraderSkillConfig,
    private readonly client: Client = getHcsClient()
  ) {}

  async start(): Promise<void> {
    if (this.running || !this.config.enabled) {
      return;
    }

    this.validateConfig();
    this.running = true;
    this.context.log(
      `[${this.name}] starting heartbeat loop every ${this.config.heartbeatMs}ms`
    );

    await this.heartbeat();
    this.timer = setInterval(() => {
      void this.heartbeat();
    }, this.config.heartbeatMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.context.log(`[${this.name}] stopped`);
  }

  private validateConfig(): void {
    if (process.env.MOCK_HEDERA === "true") {
      throw new Error(
        `${this.name} refuses to run with MOCK_HEDERA=true (live data only)`
      );
    }

    const required = [
      ["OPENCLAW_TRADER_ACCOUNT_ID", this.config.traderAccountId],
      ["OPENCLAW_TRADER_EVM_ADDRESS", this.config.traderEvmAddress],
      ["OPENCLAW_LIQUIDITY_ACCOUNT_ID", this.config.liquidityAccountId],
      ["OPENCLAW_SIGNER_EVM_KEY", this.config.signerEvmKey],
      ["OPENCLAW_SELL_TOKEN_ID", this.config.sellTokenId],
      ["ATOMIC_SWAP_ADDRESS", this.config.escrowContract],
      ["HEDERA_TOPIC_ID", this.context.topicId],
    ].filter(([, v]) => !v || String(v).trim().length === 0);

    if (required.length > 0) {
      const names = required.map(([name]) => name).join(", ");
      throw new Error(`[${this.name}] missing required configuration: ${names}`);
    }
  }

  private async heartbeat(): Promise<void> {
    if (!this.running || this.tickInFlight) {
      return;
    }

    this.tickInFlight = true;
    try {
      await this.evaluateAndBroadcast();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.context.log(`[${this.name}] heartbeat failed: ${msg}`);
    } finally {
      this.tickInFlight = false;
    }
  }

  private async fetchSaucerTokens(): Promise<SaucerToken[]> {
    const url = asUrl(this.config.saucerApiBaseUrl, this.config.saucerTokensPath);
    const headers: Record<string, string> = {
      accept: "application/json",
    };

    if (this.config.saucerApiKey && this.config.saucerApiKey.trim()) {
      headers["x-api-key"] = this.config.saucerApiKey.trim();
    }

    const raw = await fetchJson<unknown>(url, { headers });
    const tokens = parseSaucerTokens(raw);
    if (tokens.length === 0) {
      throw new Error(
        `No token data returned from SaucerSwap endpoint ${url}; verify SAUCERSWAP_* configuration`
      );
    }
    return tokens;
  }

  private async getHbarBalanceTinybar(accountId: string): Promise<bigint> {
    const url = asUrl(this.config.mirrorNodeApiBaseUrl, `/accounts/${accountId}`);
    const account = await fetchJson<AccountResponse>(url, {
      headers: { accept: "application/json" },
    });
    return toBigInt(account.balance?.balance);
  }

  private async getTokenBalance(accountId: string, tokenId: string): Promise<bigint> {
    const base = asUrl(this.config.mirrorNodeApiBaseUrl, `/tokens/${tokenId}/balances`);
    const url = `${base}?account.id=${encodeURIComponent(accountId)}&limit=1`;
    const resp = await fetchJson<TokenBalanceResponse>(url, {
      headers: { accept: "application/json" },
    });
    return toBigInt(resp.balances?.[0]?.balance);
  }

  private async getAssetBalance(accountId: string, token: string): Promise<bigint> {
    if (token.toUpperCase() === "HBAR") {
      return this.getHbarBalanceTinybar(accountId);
    }
    return this.getTokenBalance(accountId, token);
  }

  private async evaluateAndBroadcast(): Promise<void> {
    const tokens = await this.fetchSaucerTokens();

    const sell = findToken(tokens, this.config.sellTokenId);
    if (!sell) {
      throw new Error(`Sell token ${this.config.sellTokenId} not found in SaucerSwap feed`);
    }

    const buy = findToken(tokens, this.config.buyToken);
    if (!buy) {
      throw new Error(`Buy token ${this.config.buyToken} not found in SaucerSwap feed`);
    }

    const marketPriceInBuyToken = sell.priceUsd / buy.priceUsd;
    if (!Number.isFinite(marketPriceInBuyToken) || marketPriceInBuyToken <= 0) {
      throw new Error("Invalid market price computed from SaucerSwap token feed");
    }

    // Quote slightly inside market to improve fill probability.
    const quotePriceInBuyToken =
      marketPriceInBuyToken * (1 - this.config.quoteDiscountBps / 10_000);
    const slippageBps =
      (Math.abs(quotePriceInBuyToken - marketPriceInBuyToken) / marketPriceInBuyToken) *
      10_000;

    if (slippageBps > this.config.maxSlippageBps) {
      this.context.log(
        `[${this.name}] skipped: slippage ${slippageBps.toFixed(2)}bps > max ${this.config.maxSlippageBps}bps`
      );
      return;
    }

    const buyDecimals = buy.symbol.toUpperCase() === "HBAR" ? 8 : buy.decimals;
    const quotePriceSmallestUnit = BigInt(
      Math.max(1, Math.round(quotePriceInBuyToken * 10 ** buyDecimals))
    );

    const requiredBuySmallestUnit =
      (this.config.sellAmountSmallestUnit * quotePriceSmallestUnit) / pow10(sell.decimals);

    const traderSellBalance = await this.getAssetBalance(
      this.config.traderAccountId,
      this.config.sellTokenId
    );
    if (traderSellBalance < this.config.sellAmountSmallestUnit) {
      this.context.log(
        `[${this.name}] skipped: trader sell balance ${traderSellBalance} < required ${this.config.sellAmountSmallestUnit}`
      );
      return;
    }

    const liquidityBalance = await this.getAssetBalance(
      this.config.liquidityAccountId,
      this.config.buyToken
    );
    if (liquidityBalance < requiredBuySmallestUnit) {
      this.context.log(
        `[${this.name}] skipped: liquidity balance ${liquidityBalance} < required ${requiredBuySmallestUnit}`
      );
      return;
    }

    const requestId = `openclaw-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const envelope = buildCheckoutProposal(
      {
        requestId,
        initiatorAccount: this.config.traderAccountId,
        sellToken: this.config.sellTokenId,
        sellAmountSmallestUnit: this.config.sellAmountSmallestUnit,
        buyToken: this.config.buyToken,
        limitPriceSmallestUnit: quotePriceSmallestUnit,
        slippageBps: Math.round(slippageBps),
        ttlSeconds: 120,
        escrowContract: this.config.escrowContract,
      },
      this.config.traderEvmAddress
    );

    await publishProposal(
      this.client,
      this.context.topicId,
      envelope,
      normaliseHexKey(this.config.signerEvmKey)
    );

    this.context.log(
      `[${this.name}] offer broadcast: requestId=${requestId}` +
        ` market=${marketPriceInBuyToken.toFixed(8)} quote=${quotePriceInBuyToken.toFixed(8)}` +
        ` slippage=${slippageBps.toFixed(2)}bps`
    );
  }
}
