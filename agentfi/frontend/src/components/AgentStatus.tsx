"use client";

import { useEffect, useState } from "react";
import { AgentStatusResponse, getAgentStatus } from "@/lib/api";

export function AgentStatusCard() {
  const [status, setStatus] = useState<AgentStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await getAgentStatus();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/80 p-5 shadow-lg backdrop-blur">
      <h2 className="text-xl font-semibold text-[var(--ink)]">Agent Network Status</h2>
      {status ? (
        <div className="mt-3 space-y-1 text-sm text-[var(--ink)]">
          <p>User Agent: {status.userAgentOnline ? "online" : "offline"}</p>
          <p>Market Agent: {status.marketAgentOnline ? "online" : "offline"}</p>
          <p>Hedera Link: {status.hederaConnected ? "connected" : "not configured"}</p>
          <p>Topic: {status.topicId || "not created"}</p>
          <p>Negotiation Messages: {status.negotiationCount}</p>
          <p>
            Last Activity: {status.lastMessageAt ? new Date(status.lastMessageAt).toLocaleString() : "No activity yet"}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--muted)]">Loading agent status...</p>
      )}
    </section>
  );
}
