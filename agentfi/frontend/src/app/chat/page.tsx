"use client";

import { useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { NegotiationFeed } from "@/components/NegotiationFeed";
import { TradeMessage } from "@/lib/api";

export default function ChatPage() {
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [requestId, setRequestId] = useState("");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-3xl font-semibold text-[var(--ink)]">AgentFi Chat Console</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">User -&gt; AI Trading Agent -&gt; HCS Messaging -&gt; Market Agent</p>
      <p className="mt-2 text-sm text-[var(--ink)]">Latest Request ID: {requestId || "none"}</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <ChatWindow onNegotiationUpdate={setMessages} onRequestCreated={setRequestId} />
        <NegotiationFeed messages={messages} />
      </div>
    </main>
  );
}
