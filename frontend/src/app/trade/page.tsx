"use client";

import { useState } from "react";
import { NegotiationFeed } from "@/components/NegotiationFeed";
import { TradePanel } from "@/components/TradePanel";
import { TradeMessage } from "@/lib/api";

export default function TradePage() {
  const [requestId, setRequestId] = useState("req-");
  const [messages, setMessages] = useState<TradeMessage[]>([]);

  return (
    <main className="mx-auto max-w-[1300px] px-4 py-8 md:px-8">
      <h1 className="font-[var(--font-orbitron)] text-3xl text-slate-100">Execution Console</h1>
      <p className="mt-1 text-sm text-slate-300/80">
        Paste a negotiated request ID and authorize AtomicSwap settlement on Hedera EVM.
      </p>

      <div className="panel-card mt-5 p-4">
        <label className="text-sm text-slate-300">Request ID</label>
        <input
          value={requestId}
          onChange={(event) => setRequestId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-200"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <TradePanel requestId={requestId} onNegotiationUpdate={(items) => setMessages(items || [])} />
        <NegotiationFeed messages={messages} />
      </div>
    </main>
  );
}
