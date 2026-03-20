"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getTradeHistoryHashScanUrl,
  loadTradeHistory,
  TradeHistoryEntry,
} from "@/lib/tradeHistory";

function shortHash(hash: string): string {
  if (hash.length <= 18) {
    return hash;
  }

  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export function TradeHistoryPanel() {
  const [entries, setEntries] = useState<TradeHistoryEntry[]>([]);

  useEffect(() => {
    const refresh = () => {
      setEntries(loadTradeHistory());
    };

    refresh();

    const handleStorage = () => refresh();
    const handleCustomUpdate = () => refresh();

    window.addEventListener("storage", handleStorage);
    window.addEventListener("agentfi-trade-history-updated", handleCustomUpdate);

    const interval = window.setInterval(refresh, 5000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("agentfi-trade-history-updated", handleCustomUpdate);
      window.clearInterval(interval);
    };
  }, []);

  const summary = useMemo(() => {
    const totalVolume = entries.reduce((sum, entry) => sum + entry.usdcSent, 0);
    return {
      count: entries.length,
      totalVolume,
      latest: entries[0] ?? null,
    };
  }, [entries]);

  if (entries.length === 0) {
    return (
      <section className="rounded-4xl border border-violet-400/20 bg-black/50 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-2xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-violet-200/60">History</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Completed trades</h2>
            <p className="mt-2 text-sm text-slate-300/80">
              Your executed trades will appear here with a transaction hash, settlement summary, and HashScan link.
            </p>
          </div>
          <Link
            href="/chat"
            className="inline-flex items-center justify-center rounded-full border border-violet-400/30 bg-violet-500 px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
          >
            START NEW TRADE
          </Link>
        </div>

        <div className="mt-6 rounded-[28px] border border-dashed border-white/10 bg-black/30 p-8 text-center">
          <p className="text-lg font-semibold text-white">No executed trades yet</p>
          <p className="mt-2 text-sm text-slate-400">Finish a trade in the console and it will be stored here automatically.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-4xl border border-violet-400/20 bg-black/50 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-2xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.4em] text-violet-200/60">History</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Completed trades</h2>
          <p className="mt-2 text-sm text-slate-300/80">
            Review every successful swap, including the final tx hash and the settlement details captured from the backend.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Trades</p>
            <p className="mt-2 text-xl font-semibold text-white">{summary.count}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">USDC volume</p>
            <p className="mt-2 text-xl font-semibold text-white">{summary.totalVolume.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Latest</p>
            <p className="mt-2 text-xs font-mono text-violet-100">
              {summary.latest ? shortHash(summary.latest.txHash) : "-"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {entries.map((entry) => {
          const hashScanUrl = getTradeHistoryHashScanUrl(entry.txHash);

          return (
            <article key={`${entry.requestId}-${entry.timestamp}`} className="rounded-[28px] border border-white/10 bg-black/40 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Request</p>
                  <p className="mt-2 break-all font-mono text-sm text-slate-200">{entry.requestId}</p>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {entry.amount} {entry.token} → {entry.hbarReceived} {entry.buyToken}
                  </p>
                  <p className="mt-2 text-sm text-slate-300/80">
                    Price {entry.price.toFixed(6)} | {entry.settlement ?? "Settlement confirmed"}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-emerald-100">
                    EXECUTED
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] font-mono uppercase tracking-[0.25em] text-slate-300">
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Hash</p>
                  <p className="mt-2 font-mono text-xs text-violet-100">{shortHash(entry.txHash)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">USDC sent</p>
                  <p className="mt-2 font-mono text-xs text-violet-100">{entry.usdcSent.toFixed(2)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">HBAR received</p>
                  <p className="mt-2 font-mono text-xs text-violet-100">{entry.hbarReceived.toFixed(6)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Action</p>
                  <p className="mt-2 text-sm text-slate-200">Replay or inspect the transaction.</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={hashScanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-violet-400/30 bg-violet-500 px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.02]"
                >
                  VIEW ON HASHSCAN
                </a>
                <Link
                  href={`/trade?requestId=${encodeURIComponent(entry.requestId)}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-violet-400/20 hover:bg-violet-500/10"
                >
                  OPEN CONSOLE
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/chat"
          className="rounded-full border border-violet-400/30 bg-violet-500 px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
        >
          START NEW TRADE
        </Link>
        <Link
          href="/trade"
          className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-400/20 hover:bg-violet-500/10"
        >
          OPEN TRADE CONSOLE
        </Link>
      </div>
    </section>
  );
}
