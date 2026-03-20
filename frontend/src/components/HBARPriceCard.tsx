'use client';

import { useEffect, useState } from 'react';

type PriceState = {
  price: number | null;
  change: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  updatedAt: number | null;
  chartPoints: Array<{ x: number; y: number }>;
  loading: boolean;
  error: string | null;
};

function formatPrice(value: number | null): string {
  if (value === null) {
    return '--';
  }

  return `$${value.toFixed(4)}`;
}

function formatCompactNumber(value: number | null): string {
  if (value === null) {
    return '--';
  }

  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function createSparklinePoints(prices: Array<[number, number]>): Array<{ x: number; y: number }> {
  if (prices.length === 0) {
    return [];
  }

  const values = prices.map(([, price]) => price);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const width = 100;
  const height = 100;
  const range = maxValue - minValue || 1;

  return prices.map(([, price], index) => ({
    x: prices.length === 1 ? width / 2 : (index / (prices.length - 1)) * width,
    y: height - ((price - minValue) / range) * height,
  }));
}

function pointsToString(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

export default function HBARPriceCard() {
  const [state, setState] = useState<PriceState>({
    price: null,
    change: null,
    high: null,
    low: null,
    volume: null,
    updatedAt: null,
    chartPoints: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    const abortController = new AbortController();

    const fetchPrice = async () => {
      try {
        const [coinResponse, chartResponse] = await Promise.all([
          fetch(
            'https://api.coingecko.com/api/v3/coins/hedera-hashgraph?localization=false&tickers=false&community_data=false&developer_data=false',
            {
              signal: abortController.signal,
            }
          ),
          fetch('https://api.coingecko.com/api/v3/coins/hedera-hashgraph/market_chart?vs_currency=usd&days=1', {
            signal: abortController.signal,
          }),
        ]);

        if (!coinResponse.ok) {
          throw new Error(`CoinGecko coin endpoint returned ${coinResponse.status}`);
        }

        if (!chartResponse.ok) {
          throw new Error(`CoinGecko chart endpoint returned ${chartResponse.status}`);
        }

        const [coinData, chartData] = await Promise.all([coinResponse.json(), chartResponse.json()]);
        const market = coinData.market_data;
        const sparklinePrices = Array.isArray(chartData.prices) ? (chartData.prices as Array<[number, number]>) : [];

        if (!active || !market) {
          return;
        }

        setState({
          price: market.current_price?.usd ?? null,
          change: market.price_change_percentage_24h ?? null,
          high: market.high_24h?.usd ?? null,
          low: market.low_24h?.usd ?? null,
          volume: market.total_volume?.usd ?? null,
          updatedAt: Date.now(),
          chartPoints: createSparklinePoints(sparklinePrices),
          loading: false,
          error: null,
        });
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }

        console.error('Price fetch failed:', error);
        setState((current) => ({
          ...current,
          loading: false,
          error: 'Live price feed unavailable',
        }));
      }
    };

    void fetchPrice();
    const intervalId = window.setInterval(fetchPrice, 30000);

    return () => {
      active = false;
      abortController.abort();
      window.clearInterval(intervalId);
    };
  }, []);

  const isPositive = (state.change ?? 0) >= 0;
  const changeLabel =
    state.change === null
      ? '--'
      : `${isPositive ? '▲' : '▼'} ${Math.abs(state.change).toFixed(2)}% (24h)`;

  const sparklinePoints = pointsToString(state.chartPoints);
  const sparklineArea =
    state.chartPoints.length > 1
      ? `${sparklinePoints} 100,100 0,100`
      : '';

  const updatedLabel = state.updatedAt
    ? new Date(state.updatedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
      })
    : '--';

  return (
    <div className="overflow-hidden rounded-[28px] border border-violet-400/20 bg-black/80 shadow-[0_24px_80px_rgba(2,6,23,0.72)]">
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">HBAR / USD</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Live market price</h3>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-emerald-100">Live</span>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-5 md:p-6">
        <div>
          <p className="text-5xl font-black tracking-tight text-white md:text-6xl">
            {state.loading && state.price === null ? '...' : formatPrice(state.price)}
          </p>
          <p
            className={`mt-3 text-lg font-semibold ${state.error ? 'text-amber-300' : isPositive ? 'text-emerald-300' : 'text-rose-300'}`}
          >
            {state.error ?? changeLabel}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-black/50 p-4 md:p-5">
          <svg viewBox="0 0 100 100" className="h-56 w-full overflow-visible" role="img" aria-label="HBAR price sparkline">
            <defs>
              <linearGradient id="sparklineStroke" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#c084fc" />
                <stop offset="50%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>
              <linearGradient id="sparklineFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(168,85,247,0.35)" />
                <stop offset="100%" stopColor="rgba(168,85,247,0)" />
              </linearGradient>
            </defs>

            <rect x="0" y="0" width="100" height="100" rx="8" fill="rgba(255,255,255,0.02)" />

            {state.chartPoints.length > 1 ? (
              <>
                <polygon points={sparklineArea} fill="url(#sparklineFill)" opacity="0.9" />
                <polyline
                  points={sparklinePoints}
                  fill="none"
                  stroke="url(#sparklineStroke)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </>
            ) : (
              <line x1="10" y1="50" x2="90" y2="50" stroke="rgba(168,85,247,0.6)" strokeDasharray="3 3" />
            )}
          </svg>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">24H High</p>
            <p className="mt-2 text-lg font-semibold text-white">{formatPrice(state.high)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">24H Low</p>
            <p className="mt-2 text-lg font-semibold text-white">{formatPrice(state.low)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Volume</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {state.loading && state.volume === null ? '...' : state.volume === null ? '--' : `$${formatCompactNumber(state.volume)}`}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-300/80">Updated: {updatedLabel}</p>
          <a
            href="https://www.coingecko.com/en/coins/hedera-hashgraph"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-full border border-violet-400/30 bg-violet-500 px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.02]"
          >
            View on CoinGecko ↗
          </a>
        </div>
      </div>
    </div>
  );
}