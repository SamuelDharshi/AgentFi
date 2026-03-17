import { ObserverFlowState } from "@/lib/observer";

const STATES: ObserverFlowState[] = [
  "Discovering",
  "Negotiating",
  "Executing",
  "Settled",
];

const STATE_COLORS = {
  Discovering: {
    border: "border-cyan-400",
    bg: "bg-cyan-400/10",
    text: "text-cyan-100",
    icon: "🔍",
    animated: "animate-pulse-cyan",
  },
  Negotiating: {
    border: "border-amber-400",
    bg: "bg-amber-400/10",
    text: "text-amber-100",
    icon: "↔️",
    animated: "animate-pulse-amber animate-bounce-arrows",
  },
  Executing: {
    border: "border-orange-400",
    bg: "bg-orange-400/10",
    text: "text-orange-100",
    icon: "⛓️",
    animated: "animate-pulse-orange",
  },
  Settled: {
    border: "border-emerald-400",
    bg: "bg-emerald-400/10",
    text: "text-emerald-100",
    icon: "✅",
    animated: "",
  },
};

interface FlowStateTrackerProps {
  current: ObserverFlowState;
  reason?: string;
  updatedAt: number | null;
  txHash?: string | null;
}

export function FlowStateTracker({
  current,
  reason,
  updatedAt,
  txHash,
}: FlowStateTrackerProps) {
  const currentIndex = Math.max(0, STATES.indexOf(current));

  return (
    <section className="panel-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="panel-title">Flow State</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-mono uppercase tracking-[0.2em] border transition-all duration-300 ${STATE_COLORS[current as keyof typeof STATE_COLORS].border} ${STATE_COLORS[current as keyof typeof STATE_COLORS].bg} ${STATE_COLORS[current as keyof typeof STATE_COLORS].text}`}>
          {STATE_COLORS[current as keyof typeof STATE_COLORS].icon} {current}
        </span>
      </div>

      <ol className="grid gap-3 md:grid-cols-4">
        {STATES.map((state, index) => {
          const isDone = index < currentIndex;
          const isActive = index === currentIndex;
          const stateConfig = STATE_COLORS[state as keyof typeof STATE_COLORS];

          return (
            <li
              key={state}
              className={`rounded-lg border px-4 py-3 transition-all duration-300 ${
                isActive
                  ? `${stateConfig.animated} ${stateConfig.border} ${stateConfig.bg} ${stateConfig.text} shadow-lg`
                  : isDone
                    ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
                    : "border-slate-700 bg-slate-900/60 text-slate-400"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">
                  {isDone ? "✅" : isActive ? stateConfig.icon : "⏳"}
                </span>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em]">
                  {isActive ? "ACTIVE" : isDone ? "DONE" : "QUEUED"}
                </p>
              </div>
              <p className="font-semibold text-sm">{state}</p>
            </li>
          );
        })}
      </ol>

      {current === "Settled" && txHash ? (
        <div className="mt-5 rounded-lg border border-emerald-400/40 bg-emerald-400/5 p-3">
          <p className="text-xs text-emerald-300/80 font-mono mb-2">Transaction Hash:</p>
          <p className="text-sm font-mono text-emerald-200 break-all">{txHash}</p>
          <div className="mt-2 space-y-1 text-xs text-emerald-300/80">
            <p>✅ HBAR → User confirmed</p>
            <p>✅ USDC → Market confirmed</p>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-xs text-slate-400">
        {reason ? `Trigger: ${reason}` : "Watching autonomous agent transitions in real time."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Last update: {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "waiting"}
      </p>
    </section>
  );
}
