"use client";

import { useEffect, useState } from "react";
import { AgentStatusResponse, getAgentStatus } from "@/lib/api";

export function AgentStatusCard() {
  const [status, setStatus] = useState<AgentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await getAgentStatus();
        if (!active) return;
        setStatus(data);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to fetch status");
      }
    };

    const kickoff = window.setTimeout(() => {
      void load();
    }, 0);

    const interval = window.setInterval(() => {
      void load();
    }, 5000);

    return () => {
      active = false;
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, []);

  if (error) {
    return <p className="text-sm text-amber-300">{error}</p>;
  }

  const getStatusColor = (online: boolean) => online ? "text-green-400" : "text-red-400";
  const getStatusDot = (online: boolean) => online ? "🟢" : "🔴";

  return (
    <section className="panel-card p-5 border-2 border-violet-400/30">
      <h2 className="panel-title text-violet-300">🔗 Agent Network Status</h2>
      {status ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className={getStatusColor(status.userAgentOnline)}>
            {getStatusDot(status.userAgentOnline)} User Agent: {status.userAgentOnline ? "online" : "offline"}
          </p>
          <p className={getStatusColor(status.marketAgentOnline)}>
            {getStatusDot(status.marketAgentOnline)} Market Agent: {status.marketAgentOnline ? "online" : "offline"}
          </p>
          <p className={getStatusColor(status.hederaConnected)}>
            {getStatusDot(status.hederaConnected)} Hedera Link: {status.hederaConnected ? "connected" : "not configured"}
          </p>
          <p className="font-mono text-cyan-400">
            📍 Topic: {status.topicId ? `0.0.${status.topicId.split(".")[2]}` : "not created"}
          </p>
          <p className="text-violet-300">💬 Negotiations: {status.negotiationCount}</p>
          <p className="text-slate-400 text-xs">
            Last Activity: {status.lastMessageAt ? new Date(status.lastMessageAt).toLocaleString() : "No activity yet"}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">⏳ Loading agent status...</p>
      )}
    </section>
  );
}
