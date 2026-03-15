import { AgentStatusCard } from "@/components/AgentStatus";

export default function AgentStatusPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-8 md:px-8">
      <h1 className="font-[var(--font-orbitron)] text-3xl text-slate-100">Observer Status</h1>
      <p className="mt-1 text-sm text-slate-300/80">
        Operational heartbeat for agent network connectivity and HCS topic telemetry.
      </p>
      <div className="mt-6">
        <AgentStatusCard />
      </div>
    </main>
  );
}
