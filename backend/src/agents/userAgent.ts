import { randomUUID } from "crypto";
import Groq from "groq-sdk";
import { AgentAnalysis, TradePayload } from "../types/messages";
import { getHbarPrice } from "../utils/priceCache";

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

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY missing - get free key at groq.com and add to backend/.env"
    );
  }
  return new Groq({ apiKey });
}

// Groq retry wrapper with exponential backoff
async function callGroqWithRetry(
  messages: any[],
  retries = 3
): Promise<string> {
  const groq = getGroqClient();

  for (let i = 0; i < retries; i++) {
    try {
      const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        messages,
        temperature: 0.1,
        max_tokens: 500
      });
      return response.choices[0]?.message?.content || "";
    } catch (err: any) {
      // Check for rate limit (429)
      if (err?.status === 429 && i < retries - 1) {
        const waitMs = (i + 1) * 2000; // 2s, 4s, 6s
        // eslint-disable-next-line no-console
        console.warn(`[Groq] Rate limited - waiting ${waitMs}ms then retry ${i + 1}/${retries}`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      // Check for other retryable errors
      if ((err?.status >= 500 || err?.code === "ECONNRESET") && i < retries - 1) {
        const waitMs = (i + 1) * 1000;
        // eslint-disable-next-line no-console
        console.warn(`[Groq] Server error ${err?.status} - retrying in ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Groq failed after retries");
}

function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

async function requestGroqJson<T>(
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  const messages: any[] = [
    { role: "system", content: systemPrompt + "\n\nCRITICAL: Return ONLY the raw JSON object. No markdown code blocks, no backticks, no extra text before or after. Just the JSON." },
    { role: "user", content: userPrompt },
  ];

  let modelText = await callGroqWithRetry(messages, 3);

  // Aggressive cleanup: extract just the JSON object
  modelText = modelText.trim();

  // Find the first { and last }
  const firstBrace = modelText.indexOf('{');
  const lastBrace = modelText.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    modelText = modelText.substring(firstBrace, lastBrace + 1);
  }

  if (!modelText) {
    throw new Error("Groq returned an empty response");
  }

  try {
    return JSON.parse(modelText) as T;
  } catch (e) {
    throw new Error(
      `Groq returned invalid JSON: ${modelText.slice(0, 240)}`,
    );
  }
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
  // Use cached HBAR price first
  const hbarUsd = await getHbarPrice();
  
  // Fallback prices for common tokens (avoid CoinGecko API calls)
  const fallbackPrices: Record<string, number> = {
    "usd-coin": 1.0,
    tether: 1.0,
    "hedera-hashgraph": hbarUsd,
    bitcoin: 65000,
    ethereum: 3500,
  };
  
  const sellId = resolveCoinGeckoId(sellToken, "SELL");
  const buyId = resolveCoinGeckoId(buyToken, "BUY");
  
  // Try to fetch from CoinGecko, use fallback on rate limit
  let sellUsd = fallbackPrices[sellId];
  let buyUsd = fallbackPrices[buyId];
  
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
    };
    const apiKey = process.env.COINGECKO_API_KEY?.trim();
    if (apiKey) {
      headers["x-cg-pro-api-key"] = apiKey;
    }
    
    const ids = Array.from(new Set([sellId, buyId, "hedera-hashgraph"]));
    const params = new URLSearchParams({
      ids: ids.join(","),
      vs_currencies: "usd",
    });
    
    const response = await fetch(
      `${COINGECKO_SIMPLE_PRICE_URL}?${params.toString()}`,
      { headers },
    );
    
    if (response.ok) {
      const data = await response.json() as CoinGeckoSimplePriceResponse;
      if (data[sellId]?.usd) sellUsd = data[sellId].usd;
      if (data[buyId]?.usd) buyUsd = data[buyId].usd;
      // eslint-disable-next-line no-console
      console.log(`[userAgent] CoinGecko prices fetched: ${sellId}=$${sellUsd}, ${buyId}=$${buyUsd}`);
    } else if (response.status === 429) {
      // eslint-disable-next-line no-console
      console.warn(`[userAgent] CoinGecko rate limited - using fallback prices`);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[userAgent] CoinGecko error ${response.status} - using fallback prices`);
    }
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error(`[userAgent] CoinGecko fetch failed: ${err.message} - using fallback prices`);
  }
  
  // Ensure we have valid prices
  if (!sellUsd || sellUsd <= 0) {
    throw new Error(`Missing valid USD price for ${sellToken} (${sellId})`);
  }
  if (!buyUsd || buyUsd <= 0) {
    throw new Error(`Missing valid USD price for ${buyToken} (${buyId})`);
  }
  
  // Use fallback volume (not critical for basic trading)
  const hbarDailyVolumeUsd = 100000000; // $100M fallback
  
  return {
    sellUsd,
    buyUsd,
    hbarUsd,
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

async function parseTradeIntentWithGroq(
  input: string,
): Promise<ParsedTradeIntent> {
  const parsed = await requestGroqJson<ParsedTradeIntent>(
    "You extract OTC trade intents from natural language. Return strict JSON: { side: 'BUY'|'SELL', amount: number, sellToken: string, buyToken: string, reasoning: string }. Rules: (1) amount must be a positive finite number - convert shorthand like 1k to 1000, 2.5k to 2500, 1m to 1000000; (2) sellToken is the token the user gives away, buyToken is what they receive; (3) for 'Sell X A for B', sellToken=A buyToken=B; (4) for 'Buy X A with B', sellToken=B buyToken=A; (5) accept any token symbol including HBAR, USDC, USDT, BTC, ETH. Never use placeholder amounts - always extract the exact numeric value the user stated.",
    input,
  );

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
    throw new Error("Groq parse failed: side must be BUY or SELL");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Groq parse failed: amount must be a positive number");
  }
  if (!sellToken || !buyToken) {
    throw new Error("Groq parse failed: sellToken and buyToken are required");
  }

  return {
    side,
    amount,
    sellToken,
    buyToken,
    reasoning,
  };
}

async function analyzeRiskWithGroq(
  input: string,
  intent: ParsedTradeIntent,
  recommendedPrice: number,
  slippagePct: number,
  liquidityRatioPct: number,
  snapshot: MarketSnapshot,
): Promise<RiskDecision> {
  const parsed = await requestGroqJson<RiskDecision>(
    "You are a live OTC risk analyst. Return strict JSON: { riskScore: number, strategy: 'OTC'|'DEX', reasoning: string }. Keep riskScore in [0,1], reasoning <= 240 chars, and prefer OTC when size vs liquidity is high.",
    `Input=${input}\n` +
      `Intent=${intent.side} ${intent.amount} ${intent.sellToken} for ${intent.buyToken}\n` +
      `recommendedPrice=${recommendedPrice}\n` +
      `slippagePct=${slippagePct}\n` +
      `liquidityRatioPct=${liquidityRatioPct}\n` +
      `sellUsd=${snapshot.sellUsd}\n` +
      `buyUsd=${snapshot.buyUsd}\n` +
      `hbarUsd=${snapshot.hbarUsd}\n` +
      `hbarDailyVolumeUsd=${snapshot.hbarDailyVolumeUsd}`,
  );

  const riskScore = Number(parsed.riskScore);

  if (!Number.isFinite(riskScore) || riskScore < 0 || riskScore > 1) {
    throw new Error("Groq risk analysis failed: riskScore out of range");
  }
  if (parsed.strategy !== "OTC" && parsed.strategy !== "DEX") {
    throw new Error("Groq risk analysis failed: strategy must be OTC or DEX");
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
  const intent = await parseTradeIntentWithGroq(input);
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

  const risk = await analyzeRiskWithGroq(
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
