"use client";

import { FormEvent, useState } from "react";
import { ChatResponse, sendChat } from "@/lib/api";

interface ChatWindowProps {
  onNegotiationUpdate: (messages: ChatResponse["negotiation"]) => void;
  onRequestCreated: (requestId: string) => void;
}

export function ChatWindow({ onNegotiationUpdate, onRequestCreated }: ChatWindowProps) {
  const [wallet, setWallet] = useState("0.0.5005");
  const [message, setMessage] = useState("Sell 500000 USDC for HBAR");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await sendChat(message, wallet);
      setResponse(data);
      onNegotiationUpdate(data.negotiation);
      onRequestCreated(data.tradeRequest.requestId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/80 p-5 shadow-lg backdrop-blur">
      <h2 className="text-xl font-semibold text-[var(--ink)]">User to AI Trading Agent</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Ask your agent to negotiate OTC trades over Hedera Consensus Service.</p>

      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <input
          className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
          value={wallet}
          onChange={(event) => setWallet(event.target.value)}
          placeholder="Wallet account id"
          required
        />
        <textarea
          className="h-28 w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Sell 500000 USDC for HBAR"
          required
        />
        <button
          className="rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white transition hover:brightness-95 disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {loading ? "Negotiating..." : "Send to Agent"}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      {response ? (
        <div className="mt-5 rounded-xl bg-[var(--panel)] p-4 text-sm text-[var(--ink)]">
          <p className="font-semibold">AI Analysis</p>
          <p className="mt-1">Exchange slippage: {response.analysis.slippagePct}%</p>
          <p>OTC recommendation: ${response.analysis.recommendedPrice}</p>
          <p>Suggested execution: {response.analysis.strategy}</p>
          <p className="mt-2 text-[var(--muted)]">{response.analysis.reasoning}</p>
          <p className="mt-3 text-xs text-[var(--muted)]">Request ID: {response.tradeRequest.requestId}</p>
        </div>
      ) : null}
    </section>
  );
}
