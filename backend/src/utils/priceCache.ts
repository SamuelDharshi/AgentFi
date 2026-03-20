// Cache HBAR price for 60 seconds
let cachedPrice: number | null = null;
let cacheTime: number = 0;
const CACHE_TTL = 60000; // 60 seconds

export async function getHbarPrice(): Promise<number> {
  const now = Date.now();

  // Return cached price if still valid
  if (cachedPrice && (now - cacheTime) < CACHE_TTL) {
    // eslint-disable-next-line no-console
    console.log(`[priceCache] Using cached HBAR price: $${cachedPrice}`);
    return cachedPrice;
  }

  try {
    const url = 'https://api.coingecko.com/api/v3/simple/price' +
      '?ids=hedera-hashgraph&vs_currencies=usd';

    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AgentFi/1.0'
      }
    });

    if (res.status === 429) {
      // eslint-disable-next-line no-console
      console.warn('[priceCache] CoinGecko rate limited - using last cached price');
      if (cachedPrice) return cachedPrice;
      // Fallback to reasonable HBAR price
      return 0.085;
    }

    if (!res.ok) {
      throw new Error(`CoinGecko error: ${res.status}`);
    }

    const data = await res.json() as { [key: string]: { usd: number } };
    const price = data?.['hedera-hashgraph']?.usd;

    if (!price || price <= 0) {
      throw new Error('Invalid price from CoinGecko');
    }

    // Update cache
    cachedPrice = price;
    cacheTime = now;
    // eslint-disable-next-line no-console
    console.log(`[priceCache] ✅ CoinGecko price fetched: $${price}`);
    return price;

  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[priceCache] CoinGecko fetch failed:', err.message);
    // Use cached price if available
    if (cachedPrice) {
      // eslint-disable-next-line no-console
      console.warn(`[priceCache] Using stale cache: $${cachedPrice}`);
      return cachedPrice;
    }
    // Last resort fallback
    // eslint-disable-next-line no-console
    console.warn('[priceCache] Using fallback price: $0.085');
    return 0.085;
  }
}
