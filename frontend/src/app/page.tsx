"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HBARPriceCard from "@/components/HBARPriceCard";
import { getAgentStatus, getHealth, AgentStatusResponse } from "@/lib/api";

type DashboardMetrics = {
  websocket: string;
  topic: string;
  negotiations: string;
  lastActivity: string;
  network: string;
};

function formatRelativeTime(timestamp: number | null, now: number): string {
  if (!timestamp) {
    return "2s ago";
  }

  const deltaSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function DashboardPage() {
  const [agentStatus, setAgentStatus] = useState<AgentStatusResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    websocket: "CONNECTED",
    topic: "0.0.8270343",
    negotiations: "0 LIVE",
    lastActivity: "2s ago",
    network: "HEDERA TESTNET",
  });

  useEffect(() => {
    let active = true;

    const loadMetrics = async () => {
      try {
        const [healthData, statusData] = await Promise.all([getHealth(), getAgentStatus()]);
        if (!active) {
          return;
        }

        setAgentStatus(statusData);
        setMetrics({
          websocket: healthData.status.toUpperCase() === "OK" ? "CONNECTED" : healthData.status.toUpperCase(),
          topic: healthData.topic || statusData.topicId || "0.0.8270343",
          negotiations: `${statusData.negotiationCount} LIVE`,
          lastActivity: formatRelativeTime(statusData.lastMessageAt, Date.now()),
          network: healthData.network.toUpperCase(),
        });
      } catch {
        if (!active) {
          return;
        }

        setAgentStatus(null);
      }
    };

    void loadMetrics();
    const refreshInterval = window.setInterval(() => {
      void loadMetrics();
    }, 5000);

    const clockInterval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(refreshInterval);
      window.clearInterval(clockInterval);
    };
  }, []);

  useEffect(() => {
    if (agentStatus) {
      setMetrics((current) => ({
        ...current,
        lastActivity: formatRelativeTime(agentStatus.lastMessageAt, now),
      }));
    }
  }, [agentStatus, now]);

  const metricsCards = [
    {
      label: "WEBSOCKET",
      value: metrics.websocket,
      dotClass: metrics.websocket === "CONNECTED" ? "bg-emerald-400" : "bg-amber-400",
    },
    {
      label: "HCS TOPIC",
      value: metrics.topic,
      mono: true,
    },
    {
      label: "NEGOTIATIONS",
      value: metrics.negotiations,
      mono: true,
    },
    {
      label: "LAST ACTIVITY",
      value: metrics.lastActivity,
      mono: true,
    },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.4em] text-violet-200/60">AgentFi dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Trading View</h1>
          <p className="mt-2 text-sm text-slate-300/80">
            Live HBAR/USD chart plus agent health and execution telemetry.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,0.95fr)]">
        <section className="overflow-hidden rounded-4xl border border-violet-400/20 bg-black/55 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-2xl">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">HBAR / USD</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Live market price</h2>
          </div>
          <div className="p-4">
            <HBARPriceCard />
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-4xl border border-violet-400/20 bg-black/55 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Live metrics</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Execution health</h2>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[0.65rem] font-mono uppercase tracking-[0.25em] text-emerald-100">
                {metrics.network}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {metricsCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">
                    {card.label}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {card.dotClass ? <span className={`h-2.5 w-2.5 rounded-full ${card.dotClass}`} /> : null}
                    <p className={card.mono ? "font-mono text-sm text-violet-100" : "text-sm font-semibold text-white"}>
                      {card.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-4xl border border-violet-400/20 bg-black/55 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-2xl">
            <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Execution path</p>
            <div className="mt-4 space-y-3">
              {[
                "Wallet signs the intent",
                "Agent quotes the market",
                "HCS negotiates securely",
                "Atomic swap settles",
                "Reputation updates on-chain",
              ].map((step, index) => (
                <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/15 text-xs font-semibold text-violet-100">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-slate-200/90">{step}</p>
                </div>
              ))}
            </div>

            <Link
              href="/chat"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-violet-400/30 bg-violet-500 px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
            >
              START TRADING →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
