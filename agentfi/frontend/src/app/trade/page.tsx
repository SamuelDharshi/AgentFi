"use client";

import { useState } from "react";
import { NegotiationFeed } from "@/components/NegotiationFeed";
import { TradePanel } from "@/components/TradePanel";
import { TradeMessage } from "@/lib/api";

export default function TradePage() {
  const [requestId, setRequestId] = useState("req-");
  const [messages, setMessages] = useState<TradeMessage[]>([]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-3xl font-semibold text-[var(--ink)]">Trade Settlement</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">Paste a request id from /chat and execute OTC transfer flow.</p>

      <div className="mt-5 rounded-2xl border border-[var(--line)] bg-white/70 p-4 shadow-lg">
        <label className="text-sm text-[var(--ink)]">Request ID</label>
        <input
          value={requestId}
          onChange={(event) => setRequestId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <TradePanel requestId={requestId} onNegotiationUpdate={(items) => setMessages(items || [])} />
        <NegotiationFeed messages={messages} />
      </div>
    </main>
  );
}
