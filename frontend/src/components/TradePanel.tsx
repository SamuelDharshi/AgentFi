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
    <section className="panel-card p-5">
      <h2 className="panel-title">Trade Execution</h2>
      <p className="mt-1 text-sm text-slate-300/80">
        Accept a negotiated offer to trigger AtomicSwap settlement on Hedera EVM.
      </p>

      <form className="mt-4 space-y-3" onSubmit={submit}>
        <input
          value={requestId}
          readOnly
          className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-200"
        />
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
          Accept market offer
        </label>
        <button
          className="rounded-lg bg-emerald-400/85 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
          type="submit"
          disabled={loading || !requestId}
        >
          {loading ? "Executing..." : "Execute Trade"}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-amber-300">{error}</p> : null}

      {result ? (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-200">
          <p>Status: {result.executed ? "Trade Executed" : "Trade Not Executed"}</p>
          {result.transactionId ? <p className="font-mono text-xs">Transaction: {result.transactionId}</p> : null}
          {result.settlement ? <p className="text-slate-300">Settlement: {result.settlement}</p> : null}
          {result.message ? <p>{result.message}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
