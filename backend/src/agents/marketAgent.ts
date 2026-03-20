import { sendTradeOffer } from "./communication";
import { TradeMessage, TradePayload } from "../types/messages";
import { getHbarPrice } from "../utils/priceCache";

interface CoinGeckoSimplePriceResponse {
  [id: string]: {
    usd?: number;
  };
}

const COINGECKO_SIMPLE_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";
const SPREAD_BPS = 50; // 0.5%

const defaultCoinGeckoIds: Record<string, string> = {
  HBAR: "hedera-hashgraph",
  USDC: "usd-coin",
  USDT: "tether",
  BTC: "bitcoin",
  ETH: "ethereum",
};

function assertWalletIdentity(wallet: string): void {
  const value = wallet.trim();
  const isHederaAccount = /^0\.0\.\d+$/.test(value);
  const isEvmAddress = /^0x[0-9a-fA-F]{40}$/.test(value);

  if (!isHederaAccount && !isEvmAddress) {
    throw new Error(`Invalid sender wallet identity: ${wallet}`);
  }
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
    const envName = role === "SELL" ? "SELL_TOKEN_COINGECKO_ID" : "BUY_TOKEN_COINGECKO_ID";
    const configured = process.env[envName]?.trim();
    if (configured) {
      return configured;
    }
    throw new Error(`Missing ${envName} for token ${normalized}`);
  }

  throw new Error(
    `No CoinGecko mapping found for token ${normalized}. Set COINGECKO_ID_${symbol}.`
  );
}

async function fetchUsdPrices(ids: string[]): Promise<Record<string, number>> {
  const uniqueIds = Array.from(new Set(ids));
  const params = new URLSearchParams({
    ids: uniqueIds.join(","),
    vs_currencies: "usd",
  });

  const headers: Record<string, string> = {
    accept: "application/json",
  };

  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  if (apiKey) {
    headers["x-cg-pro-api-key"] = apiKey;
  }

  const response = await fetch(`${COINGECKO_SIMPLE_PRICE_URL}?${params.toString()}`, {
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CoinGecko price fetch failed (${response.status}): ${body}`);
  }

  const json = (await response.json()) as CoinGeckoSimplePriceResponse;
  const prices: Record<string, number> = {};

  for (const id of uniqueIds) {
    const usd = json[id]?.usd;
    if (!Number.isFinite(usd) || (usd ?? 0) <= 0) {
      throw new Error(`Missing valid USD price for CoinGecko id ${id}`);
    }
    prices[id] = usd as number;
  }

  // eslint-disable-next-line no-console
  console.log(
    `✅ CoinGecko price fetched successfully | ids=${uniqueIds.join(",")}`
  );

  return prices;
}

export async function evaluateOffer(request: TradePayload): Promise<TradePayload> {
  const sellToken = request.token.trim();
  const buyToken = (request.buyToken ?? "HBAR").trim();

  // Use cached/fallback HBAR price
  const hbarUsd = await getHbarPrice();
  
  // Fetch only sell token price (minimize API calls)
  const sellCoinGeckoId = resolveCoinGeckoId(sellToken, "SELL");
  
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
    };
    const apiKey = process.env.COINGECKO_API_KEY?.trim();
    if (apiKey) {
      headers["x-cg-pro-api-key"] = apiKey;
    }
    
    const params = new URLSearchParams({
      ids: sellCoinGeckoId,
      vs_currencies: "usd",
    });
    
    const response = await fetch(`${COINGECKO_SIMPLE_PRICE_URL}?${params.toString()}`, { headers });
    
    if (!response.ok) {
      // Use fallback prices if rate limited
      // eslint-disable-next-line no-console
      console.warn(`[marketAgent] CoinGecko fetch failed (${response.status}), using fallback prices`);
      const fallbackPrices: Record<string, number> = {
        "usd-coin": 1.0,
        tether: 1.0,
        "hedera-hashgraph": hbarUsd,
        bitcoin: 65000,
        ethereum: 3500,
      };
      const sellUsd = fallbackPrices[sellCoinGeckoId] || 1.0;
      const marketPrice = sellUsd / hbarUsd;
      const offerPrice = Number((marketPrice * (1 - SPREAD_BPS / 10_000)).toFixed(8));
      
      return {
        ...request,
        price: offerPrice,
        timestamp: Date.now(),
        notes: `Settlement: immediate | market=${marketPrice.toFixed(8)} ${buyToken}/${sellToken} | spread=${(SPREAD_BPS / 100).toFixed(2)}% | (fallback price)`,
      };
    }
    
    const data = await response.json() as CoinGeckoSimplePriceResponse;
    const sellUsd = data[sellCoinGeckoId]?.usd;
    
    if (!sellUsd || sellUsd <= 0) {
      throw new Error(`Invalid price for ${sellToken}`);
    }
    
    const marketPrice = sellUsd / hbarUsd;
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
      throw new Error("Invalid live market price computed");
    }
    
    const offerPrice = Number((marketPrice * (1 - SPREAD_BPS / 10_000)).toFixed(8));
    
    return {
      ...request,
      price: offerPrice,
      timestamp: Date.now(),
      notes: `Settlement: immediate | market=${marketPrice.toFixed(8)} ${buyToken}/${sellToken} | spread=${(SPREAD_BPS / 100).toFixed(2)}%`,
    };
    
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error(`[marketAgent] Error fetching price: ${err.message}`);
    // Use fallback prices
    const fallbackPrices: Record<string, number> = {
      "usd-coin": 1.0,
      tether: 1.0,
      "hedera-hashgraph": hbarUsd,
    };
    const sellUsd = fallbackPrices[sellCoinGeckoId] || 1.0;
    const marketPrice = sellUsd / hbarUsd;
    const offerPrice = Number((marketPrice * (1 - SPREAD_BPS / 10_000)).toFixed(8));
    
    return {
      ...request,
      price: offerPrice,
      timestamp: Date.now(),
      notes: `Settlement: immediate | market=${marketPrice.toFixed(8)} ${buyToken}/${sellToken} | spread=${(SPREAD_BPS / 100).toFixed(2)}% | (error fallback)`,
    };
  }
}

export async function onTradeRequest(topicId: string, message: TradeMessage): Promise<TradePayload | null> {
  if (message.type !== "TRADE_REQUEST") {
    return null;
  }

  // DEBUG: Log entry
  // eslint-disable-next-line no-console
  console.log(`[DEBUG] onTradeRequest START | requestId=${message.payload.requestId}`);

  try {
    assertWalletIdentity(message.payload.wallet);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG] Wallet identity validated`);

    // eslint-disable-next-line no-console
    console.log(`✅ MarketAgent received TRADE_REQUEST | requestId=${message.payload.requestId}`);

    // eslint-disable-next-line no-console
    console.log(`[DEBUG] Calling evaluateOffer...`);
    const offer = await evaluateOffer(message.payload);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG] evaluateOffer returned | price=${offer.price}`);
    
    // eslint-disable-next-line no-console
    console.log(`[DEBUG] Calling sendTradeOffer...`);
    await sendTradeOffer(topicId, offer);
    // eslint-disable-next-line no-console
    console.log(`[DEBUG] sendTradeOffer completed`);
    
    return offer;
  } catch (error) {
    // DEBUG: Log any errors
    const details = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`[DEBUG] onTradeRequest ERROR: ${details}`);
    // eslint-disable-next-line no-console
    console.error(`[DEBUG] Stack: ${error instanceof Error ? error.stack : 'No stack'}`);
    throw error;
  }
}
