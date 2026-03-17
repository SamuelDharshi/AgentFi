import { randomUUID } from "crypto";
import OpenAI from "openai";
import { AgentAnalysis, TradePayload } from "../types/messages";

interface ParsedTradeIntent {
  side: "BUY" | "SELL";
  amount: number;
  sellToken: string;
  buyToken: string;
  reasoning: string;
}

interface RiskDecision {
  riskScore: number;
  strategy: "OTC" | "DEX";
  reasoning: string;
}

interface MarketSnapshot {
  sellUsd: number;
  buyUsd: number;
  hbarUsd: number;
  hbarDailyVolumeUsd: number;
}

interface CoinGeckoSimplePriceResponse {
  [id: string]: {
    usd?: number;
  };
}

interface CoinGeckoMarketsRow {
  id: string;
  total_volume?: number;
}

const COINGECKO_SIMPLE_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price";
const COINGECKO_MARKETS_URL = "https://api.coingecko.com/api/v3/coins/markets";

const defaultCoinGeckoIds: Record<string, string> = {
  HBAR: "hedera-hashgraph",
  USDC: "usd-coin",
  USDT: "tether",
  BTC: "bitcoin",
  ETH: "ethereum",
};

let cachedClient: OpenAI | null = null;
let cachedApiKey = "";

/**
 * Inspects an unknown error thrown by the OpenAI SDK and re-throws a clear
 * user-facing message when the root cause is a 429 quota / rate-limit error.
 */
function rethrowIfQuotaError(error: unknown): never {
  // The OpenAI SDK surfaces HTTP status on the error object.
  const status =
    (error as { status?: number })?.status ??
    (error as { response?: { status?: number } })?.response?.status;

  if (status === 429) {
    throw new Error(
      "OpenAI quota exceeded - please top up at platform.openai.com/billing",
    );
  }

  throw error;
}

function getOpenAiConfig(): { client: OpenAI; model: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for live trade analysis");
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new OpenAI({ apiKey });
    cachedApiKey = apiKey;
  }

  return {
    client: cachedClient,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
  };
}

function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

function resolveCoinGeckoId(token: string, role: "SELL" | "BUY"): string {
  const normalized = token.trim();
  const symbol = normalized.toUpperCase();

  const roleEnv = process.env[`COINGECKO_ID_${role}_${symbol}`]?.trim();
  if (roleEnv) {
    return roleEnv;
  }

  const symbolEnv = process.env[`COINGECKO_ID_${symbol}`]?.trim();
  if (symbolEnv) {
    return symbolEnv;
  }

  const mapped = defaultCoinGeckoIds[symbol];
  if (mapped) {
    return mapped;
  }

  if (/^0\.0\.\d+$/.test(normalized) || normalized.startsWith("0x")) {
    const envName =
      role === "SELL" ? "SELL_TOKEN_COINGECKO_ID" : "BUY_TOKEN_COINGECKO_ID";
    const configured = process.env[envName]?.trim();
    if (configured) {
      return configured;
    }
    throw new Error(`Missing ${envName} for token ${normalized}`);
  }

  throw new Error(
    `No CoinGecko mapping found for token ${normalized}. Set COINGECKO_ID_${symbol}.`,
  );
}

async function fetchMarketSnapshot(
  sellToken: string,
  buyToken: string,
): Promise<MarketSnapshot> {
  const sellId = resolveCoinGeckoId(sellToken, "SELL");
  const buyId = resolveCoinGeckoId(buyToken, "BUY");
  const hbarId = "hedera-hashgraph";
  const ids = Array.from(new Set([sellId, buyId, hbarId]));

  const headers: Record<string, string> = {
    accept: "application/json",
  };

  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  if (apiKey) {
    headers["x-cg-pro-api-key"] = apiKey;
  }

  const simplePriceParams = new URLSearchParams({
    ids: ids.join(","),
    vs_currencies: "usd",
  });

  const simplePriceResponse = await fetch(
    `${COINGECKO_SIMPLE_PRICE_URL}?${simplePriceParams.toString()}`,
    { headers },
  );
  if (!simplePriceResponse.ok) {
    const body = await simplePriceResponse.text();
    throw new Error(
      `CoinGecko simple price fetch failed (${simplePriceResponse.status}): ${body}`,
    );
  }

  const simplePriceJson =
    (await simplePriceResponse.json()) as CoinGeckoSimplePriceResponse;
  const sellUsd = simplePriceJson[sellId]?.usd;
  const buyUsd = simplePriceJson[buyId]?.usd;
  const hbarUsd = simplePriceJson[hbarId]?.usd;

  if (!Number.isFinite(sellUsd) || (sellUsd ?? 0) <= 0) {
    throw new Error(`Missing valid USD price for ${sellToken} (${sellId})`);
  }
  if (!Number.isFinite(buyUsd) || (buyUsd ?? 0) <= 0) {
    throw new Error(`Missing valid USD price for ${buyToken} (${buyId})`);
  }
  if (!Number.isFinite(hbarUsd) || (hbarUsd ?? 0) <= 0) {
    throw new Error("Missing valid USD price for HBAR (hedera-hashgraph)");
  }

  const marketParams = new URLSearchParams({
    vs_currency: "usd",
    ids: hbarId,
  });

  const marketResponse = await fetch(
    `${COINGECKO_MARKETS_URL}?${marketParams.toString()}`,
    {
      headers,
    },
  );
  if (!marketResponse.ok) {
    const body = await marketResponse.text();
    throw new Error(
      `CoinGecko markets fetch failed (${marketResponse.status}): ${body}`,
    );
  }

  const marketJson = (await marketResponse.json()) as CoinGeckoMarketsRow[];
  const hbarDailyVolumeUsd = Number(marketJson[0]?.total_volume ?? 0);
  if (!Number.isFinite(hbarDailyVolumeUsd) || hbarDailyVolumeUsd <= 0) {
    throw new Error("CoinGecko returned invalid HBAR daily volume");
  }

  return {
    sellUsd: sellUsd as number,
    buyUsd: buyUsd as number,
    hbarUsd: hbarUsd as number,
    hbarDailyVolumeUsd,
  };
}

function estimateSlippagePct(
  notionalUsd: number,
  dailyVolumeUsd: number,
): number {
  const participation = notionalUsd / Math.max(dailyVolumeUsd, 1);
  const raw = 0.05 + Math.sqrt(Math.max(participation, 0)) * 2.5;
  return roundTo(Math.max(0.05, Math.min(raw, 25)), 4);
}

function estimateLiquidityRatio(
  notionalUsd: number,
  dailyVolumeUsd: number,
): number {
  return roundTo((notionalUsd / Math.max(dailyVolumeUsd, 1)) * 100, 6);
}

async function parseTradeIntentWithOpenAi(
  input: string,
): Promise<ParsedTradeIntent> {
  const { client, model } = getOpenAiConfig();

  const response = await client.responses
    .create({
      model,
      input: [
        {
          role: "system",
          content:
            "You extract OTC trade intents from natural language. Return strict JSON: { side: 'BUY'|'SELL', amount: number, sellToken: string, buyToken: string, reasoning: string }. Rules: (1) amount must be a positive finite number — convert shorthand like 1k→1000, 2.5k→2500, 1m→1000000; (2) sellToken is the token the user gives away, buyToken is what they receive; (3) for 'Sell X A for B', sellToken=A buyToken=B; (4) for 'Buy X A with B', sellToken=B buyToken=A; (5) accept any token symbol including HBAR, USDC, USDT, BTC, ETH. Never use placeholder amounts — always extract the exact numeric value the user stated.",
        },
        {
          role: "user",
          content: input,
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
    })
    .catch(rethrowIfQuotaError);

  const text = response.output_text;
  const parsed = JSON.parse(text) as ParsedTradeIntent;

  const side =
    parsed.side === "BUY" ? "BUY" : parsed.side === "SELL" ? "SELL" : null;
  const amount = Number(parsed.amount);
  const sellToken = String(parsed.sellToken ?? "")
    .trim()
    .toUpperCase();
  const buyToken = String(parsed.buyToken ?? "")
    .trim()
    .toUpperCase();
  const reasoning = String(parsed.reasoning ?? "").trim();

  if (!side) {
    throw new Error("OpenAI parse failed: side must be BUY or SELL");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("OpenAI parse failed: amount must be a positive number");
  }
  if (!sellToken || !buyToken) {
    throw new Error("OpenAI parse failed: sellToken and buyToken are required");
  }

  return {
    side,
    amount,
    sellToken,
    buyToken,
    reasoning,
  };
}

async function analyzeRiskWithOpenAi(
  input: string,
  intent: ParsedTradeIntent,
  recommendedPrice: number,
  slippagePct: number,
  liquidityRatioPct: number,
  snapshot: MarketSnapshot,
): Promise<RiskDecision> {
  const { client, model } = getOpenAiConfig();

  const response = await client.responses
    .create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are a live OTC risk analyst. Return strict JSON: riskScore (0..1), strategy (OTC|DEX), reasoning (<=240 chars). Prefer OTC when size vs liquidity is high.",
        },
        {
          role: "user",
          content:
            `Input=${input}\n` +
            `Intent=${intent.side} ${intent.amount} ${intent.sellToken} for ${intent.buyToken}\n` +
            `recommendedPrice=${recommendedPrice}\n` +
            `slippagePct=${slippagePct}\n` +
            `liquidityRatioPct=${liquidityRatioPct}\n` +
            `sellUsd=${snapshot.sellUsd}\n` +
            `buyUsd=${snapshot.buyUsd}\n` +
            `hbarUsd=${snapshot.hbarUsd}\n` +
            `hbarDailyVolumeUsd=${snapshot.hbarDailyVolumeUsd}`,
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
    })
    .catch(rethrowIfQuotaError);

  const text = response.output_text;
  const parsed = JSON.parse(text) as RiskDecision;
  const riskScore = Number(parsed.riskScore);

  if (!Number.isFinite(riskScore) || riskScore < 0 || riskScore > 1) {
    throw new Error("OpenAI risk analysis failed: riskScore out of range");
  }
  if (parsed.strategy !== "OTC" && parsed.strategy !== "DEX") {
    throw new Error("OpenAI risk analysis failed: strategy must be OTC or DEX");
  }

  return {
    riskScore: roundTo(riskScore, 4),
    strategy: parsed.strategy,
    reasoning: String(parsed.reasoning ?? "").trim(),
  };
}

async function analyzeAndParseTrade(
  input: string,
): Promise<{ intent: ParsedTradeIntent; analysis: AgentAnalysis }> {
  const intent = await parseTradeIntentWithOpenAi(input);
  const snapshot = await fetchMarketSnapshot(intent.sellToken, intent.buyToken);

  const notionalUsd = intent.amount * snapshot.sellUsd;
  const recommendedPrice = roundTo(snapshot.sellUsd / snapshot.buyUsd, 8);
  const slippagePct = estimateSlippagePct(
    notionalUsd,
    snapshot.hbarDailyVolumeUsd,
  );
  const liquidityRatioPct = estimateLiquidityRatio(
    notionalUsd,
    snapshot.hbarDailyVolumeUsd,
  );

  const risk = await analyzeRiskWithOpenAi(
    input,
    intent,
    recommendedPrice,
    slippagePct,
    liquidityRatioPct,
    snapshot,
  );

  const reasoning =
    `${risk.reasoning} | parse=${intent.reasoning || "n/a"}` +
    ` | hbarUsd=${snapshot.hbarUsd.toFixed(6)}` +
    ` | notionalUsd=${notionalUsd.toFixed(2)}` +
    ` | liquidityRatioPct=${liquidityRatioPct.toFixed(6)}`;

  return {
    intent,
    analysis: {
      slippagePct,
      riskScore: risk.riskScore,
      recommendedPrice,
      strategy: risk.strategy,
      reasoning,
    },
  };
}

export async function analyzeTrade(input: string): Promise<AgentAnalysis> {
  try {
    const { analysis } = await analyzeAndParseTrade(input);
    return analysis;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Live analysis failed: ${message}`);
  }
}

export async function buildTradeRequest(
  input: string,
  wallet: string,
): Promise<{ payload: TradePayload; analysis: AgentAnalysis }> {
  const { intent, analysis } = await analyzeAndParseTrade(input);

  return {
    payload: {
      wallet,
      token: intent.sellToken,
      amount: intent.amount,
      price: analysis.recommendedPrice,
      buyToken: intent.buyToken,
      timestamp: Date.now(),
      requestId: `req-${Date.now()}-${randomUUID().slice(0, 8)}`,
      notes: `${intent.side} ${intent.amount} ${intent.sellToken} for ${intent.buyToken}`,
    },
    analysis,
  };
}
