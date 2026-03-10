"use client";

import { FormEvent, useState } from "react";
import { TradeExecutionResponse, executeTrade } from "@/lib/api";

interface TradePanelProps {
  requestId: string;
  onNegotiationUpdate: (messages: TradeExecutionResponse["negotiation"]) => void;
}

export function TradePanel({ requestId, onNegotiationUpdate }: TradePanelProps) {
  const [accepted, setAccepted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TradeExecutionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await executeTrade(requestId, accepted);
      setResult(data);
      onNegotiationUpdate(data.negotiation || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade execution failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/80 p-5 shadow-lg backdrop-blur">
      <h2 className="text-xl font-semibold text-[var(--ink)]">Trade Execution</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Accept the market agent offer to trigger Hedera settlement.</p>

      <form className="mt-4 space-y-3" onSubmit={submit}>
        <input
          value={requestId}
          readOnly
          className="w-full rounded-lg border border-[var(--line)] bg-gray-50 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          Accept market offer
        </label>
        <button
          className="rounded-lg bg-[var(--ink)] px-4 py-2 font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          type="submit"
          disabled={loading || !requestId}
        >
          {loading ? "Executing..." : "Execute Trade"}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      {result ? (
        <div className="mt-5 rounded-xl bg-[var(--panel)] p-4 text-sm">
          <p>Status: {result.executed ? "Trade Executed" : "Trade Not Executed"}</p>
          {result.transactionId ? <p>Transaction: {result.transactionId}</p> : null}
          {result.settlement ? <p>Settlement: {result.settlement}</p> : null}
          {result.message ? <p>{result.message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
