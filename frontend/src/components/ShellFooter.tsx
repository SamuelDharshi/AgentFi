import Link from "next/link";

export function ShellFooter() {
  return (
    <footer className="relative z-10 mt-16 border-t border-violet-400/20 bg-black/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-450 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <p className="text-[0.65rem] uppercase tracking-[0.4em] text-violet-200/50">Security posture</p>
          <p className="text-lg font-semibold text-white">Non-custodial execution with an auditable HCS trail.</p>
          <p className="text-sm leading-relaxed text-slate-300/80">
            AgentFi keeps wallet control with the user, settles atomically on Hedera, and preserves a readable
            negotiation history for every completed trade.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/history"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-violet-400/20 hover:bg-violet-500/10"
          >
            Trade history
          </Link>
          <Link
            href="/agent-status"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-violet-400/20 hover:bg-violet-500/10"
          >
            Observer view
          </Link>
          <a
            href="https://hashscan.io/testnet"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:border-violet-400/20 hover:bg-violet-500/10"
          >
            HashScan
          </a>
        </div>
      </div>
    </footer>
  );
}
