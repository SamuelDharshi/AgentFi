"use client";

import Link from "next/link";

interface DashboardNetworkMapProps {
  isConnected: boolean;
  stats: {
    websocket: string;
    hcsTopic: string;
    negotiations: string;
    activity: string;
  };
}

const NODE_STYLES = [
  { title: "WALLET", detail: "User signature layer", position: "col-start-1 row-start-1", tone: "from-violet-500/25 to-violet-400/10" },
  { title: "CHAT AGENT", detail: "Intent parsing & quoting", position: "col-start-3 row-start-1", tone: "from-cyan-500/25 to-cyan-400/10" },
  { title: "RISK WATCH", detail: "Offer validation", position: "col-start-1 row-start-3", tone: "from-fuchsia-500/25 to-fuchsia-400/10" },
  { title: "SETTLEMENT", detail: "Atomic swap executor", position: "col-start-3 row-start-3", tone: "from-emerald-500/25 to-emerald-400/10" },
];

export function DashboardNetworkMap({ isConnected, stats }: DashboardNetworkMapProps) {
  return (
    <section className="rounded-[32px] border border-violet-400/20 bg-black/50 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-2xl">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.42em] text-violet-200/60">Dashboard</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Agent network map</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300/80">
            Visualize how the wallet, negotiation layer, and settlement engine move a trade from intent to
            finality on Hedera.
          </p>
        </div>

        <Link
          href={isConnected ? "/chat" : "/chat"}
          onClick={(event) => {
            if (!isConnected) {
              event.preventDefault();
            }
          }}
          className="inline-flex items-center justify-center rounded-full border border-violet-400/30 bg-violet-500 px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
        >
          {isConnected ? "OPEN TRADE CONSOLE" : "CONNECT WALLET TO TRADE"}
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
        <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black/60 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.18),transparent_60%)]" />
          <div className="absolute inset-6 rounded-[24px] border border-white/5 bg-[linear-gradient(transparent_95%,rgba(255,255,255,0.04)_95%),linear-gradient(90deg,transparent_95%,rgba(255,255,255,0.04)_95%)] bg-[size:30px_30px] opacity-30" />
          <div className="relative grid min-h-[30rem] grid-cols-3 grid-rows-3 gap-4">
            <div className="absolute left-1/2 top-1/2 h-px w-[70%] -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-violet-400/30 to-transparent" />
            <div className="absolute left-1/2 top-1/2 h-[70%] w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-transparent via-violet-400/30 to-transparent" />

            {NODE_STYLES.map((node) => (
              <div
                key={node.title}
                className={`rounded-[24px] border border-white/10 bg-gradient-to-br ${node.tone} p-4 ${node.position}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.65rem] uppercase tracking-[0.35em] text-white/50">Node</p>
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-300 shadow-[0_0_20px_rgba(168,85,247,0.8)]" />
                </div>
                <p className="mt-4 text-base font-semibold text-white">{node.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-200/80">{node.detail}</p>
              </div>
            ))}

            <div className="col-start-2 row-start-2 flex items-center justify-center rounded-[28px] border border-violet-400/30 bg-black/70 p-6 shadow-[0_0_40px_rgba(168,85,247,0.12)]">
              <div className="text-center">
                <p className="text-[0.65rem] uppercase tracking-[0.45em] text-violet-200/60">Core</p>
                <p className="mt-3 text-3xl font-semibold text-white">Atomic Swap</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300/80">
                  Signed messages, market quotes, and settlement confirmations flow through a single trusted
                  channel.
                </p>
                <div className="mt-5 flex items-center justify-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.8)]" />
                  <span className="text-xs font-mono uppercase tracking-[0.3em] text-emerald-100">
                    Live negotiation ready
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Live metrics</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {[
                { label: "WEBSOCKET", value: stats.websocket },
                { label: "HCS TOPIC", value: stats.hcsTopic },
                { label: "NEGOTIATIONS", value: stats.negotiations },
                { label: "LAST ACTIVITY", value: stats.activity },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">{stat.label}</p>
                  <p className="mt-2 font-mono text-sm text-violet-100">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Execution path</p>
            <div className="mt-4 space-y-3">
              {[
                "Wallet signs the intent",
                "Market agent posts the quote",
                "User accepts inside the trade console",
                "AtomicSwap settles and logs the tx hash",
              ].map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/15 text-xs font-semibold text-violet-100">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-slate-200/90">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
