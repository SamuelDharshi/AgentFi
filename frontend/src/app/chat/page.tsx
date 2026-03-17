"use client";

import { useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { NegotiationFeed } from "@/components/NegotiationFeed";
import { TradeMessage } from "@/lib/api";

export default function ChatPage() {
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [requestId, setRequestId] = useState("");

  return (
    <main className="mx-auto max-w-325 px-4 py-8 md:px-8">
      <h1 className="font-(--font-orbitron) text-3xl text-slate-100">User Agent Console</h1>
      <p className="mt-1 text-sm text-slate-300/80">
        Submit OTC intent to your personal agent and watch market-agent negotiation in real time.
      </p>
      <p className="mt-3 text-sm text-cyan-200/90">Latest Request ID: {requestId || "none"}</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <ChatWindow onNegotiationUpdate={setMessages} onRequestCreated={setRequestId} />
        <NegotiationFeed messages={messages} />
      </div>
    </main>
  );
}
