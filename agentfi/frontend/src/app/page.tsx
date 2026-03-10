export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <section className="rounded-3xl border border-[var(--line)] bg-white/80 p-8 shadow-xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Hedera Agent-to-Agent OTC</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight text-[var(--ink)] md:text-5xl">AgentFi Trading System</h1>
        <p className="mt-3 max-w-3xl text-sm text-[var(--muted)] md:text-base">
          User chat flows into an AI trading agent, negotiates over HCS-style messages with a market agent, and executes
          settlement through Hedera transfer primitives.
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <a href="/chat" className="rounded-xl bg-[var(--accent)] px-4 py-4 font-medium text-white">
            Open /chat
          </a>
          <a href="/trade" className="rounded-xl bg-[var(--ink)] px-4 py-4 font-medium text-white">
            Open /trade
          </a>
          <a href="/agent-status" className="rounded-xl bg-[var(--panel)] px-4 py-4 font-medium text-[var(--ink)]">
            Open /agent-status
          </a>
        </div>
      </section>
    </main>
  );
}
