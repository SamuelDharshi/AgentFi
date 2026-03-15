import { ObserverFlowState } from "@/lib/observer";

const STATES: ObserverFlowState[] = [
  "Discovering",
  "Negotiating",
  "Executing",
  "Settled",
];

interface FlowStateTrackerProps {
  current: ObserverFlowState;
  reason?: string;
  updatedAt: number | null;
}

export function FlowStateTracker({
  current,
  reason,
  updatedAt,
}: FlowStateTrackerProps) {
  const currentIndex = Math.max(0, STATES.indexOf(current));

  return (
    <section className="panel-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="panel-title">Flow State</h2>
        <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-xs font-mono uppercase tracking-[0.2em] text-cyan-200">
          {current}
        </span>
      </div>

      <ol className="grid gap-2 md:grid-cols-4">
        {STATES.map((state, index) => {
          const isDone = index < currentIndex;
          const isActive = index === currentIndex;

          return (
            <li
              key={state}
              className={[
                "rounded-lg border px-3 py-3 text-sm transition",
                isActive
                  ? "border-cyan-300 bg-cyan-300/10 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.22)]"
                  : isDone
                    ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900/60 text-slate-400",
              ].join(" ")}
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.2em]">
                {isActive ? "Active" : isDone ? "Done" : "Queued"}
              </p>
              <p className="mt-1 font-semibold">{state}</p>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs text-slate-400">
        {reason ? `Trigger: ${reason}` : "Watching autonomous agent transitions in real time."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Last update: {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "waiting"}
      </p>
    </section>
  );
}
