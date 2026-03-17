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

  return (
    <section className="panel-card p-5">
      <h2 className="panel-title">Agent Network Status</h2>
      {status ? (
        <div className="mt-3 space-y-1 text-sm text-slate-200">
          <p>User Agent: {status.userAgentOnline ? "online" : "offline"}</p>
          <p>Market Agent: {status.marketAgentOnline ? "online" : "offline"}</p>
          <p>Hedera Link: {status.hederaConnected ? "connected" : "not configured"}</p>
          <p className="font-mono">Topic: {status.topicId || "not created"}</p>
          <p>Negotiation Messages: {status.negotiationCount}</p>
          <p>
            Last Activity: {status.lastMessageAt ? new Date(status.lastMessageAt).toLocaleString() : "No activity yet"}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">Loading agent status...</p>
      )}
    </section>
  );
}
