"use client";

import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { TradeHistoryPanel } from "@/components/TradeHistoryPanel";

export default function HistoryPage() {
  const { accountId, isConnected } = useWallet();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.4em] text-violet-200/60">AgentFi archive</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Trade history</h1>
          <p className="mt-2 text-sm text-slate-300/80">
            Every executed trade is stored locally with its final Hedera transaction hash and settlement summary.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/chat"
            className="rounded-full border border-violet-400/30 bg-violet-500 px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
          >
            NEW TRADE
          </Link>
          <Link
            href="/trade"
            className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-violet-400/20 hover:bg-violet-500/10"
          >
            EXECUTION CONSOLE
          </Link>
        </div>
      </div>

      <div className="mb-6 rounded-[28px] border border-white/10 bg-black/40 p-5">
        <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Wallet</p>
        <p className="mt-2 text-sm text-slate-300/80">
          {isConnected ? `Connected as ${accountId}` : "Connect a wallet to tie completed trades to your session."}
        </p>
      </div>

      <TradeHistoryPanel />
    </main>
  );
}
