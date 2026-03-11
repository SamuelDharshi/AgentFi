import { AgentStatusCard } from "@/components/AgentStatus";

export default function AgentStatusPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="text-3xl font-semibold text-[var(--ink)]">Agent Status</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Operational health for User Agent, Market Agent, and Hedera connection.</p>
      <div className="mt-6">
        <AgentStatusCard />
      </div>
    </main>
  );
}
