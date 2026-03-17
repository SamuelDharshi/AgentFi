"use client";

import { useState } from "react";
import { TradeExecutionResponse, TradePayload, executeTrade } from "@/lib/api";

interface TradePanelProps {
  requestId: string;
  offer: TradePayload | null;
  offerPolling: boolean;
  offerError: string | null;
  walletAccountId: string | null;
  isWalletConnected: boolean;
  onNegotiationUpdate: (messages: TradeExecutionResponse["negotiation"]) => void;
}

export function TradePanel({
  requestId,
  offer,
  offerPolling,
  offerError,
  walletAccountId,
  isWalletConnected,
  onNegotiationUpdate,
}: TradePanelProps) {
  const [loadingAction, setLoadingAction] = useState<"accept" | "reject" | null>(null);
  const [result, setResult] = useState<TradeExecutionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(accepted: boolean) {
    if (!requestId || !offer) {
      return;
    }

    if (accepted && !isWalletConnected) {
      setError("Please connect your wallet to accept trades");
      return;
    }

    setLoadingAction(accepted ? "accept" : "reject");
    setError(null);

    try {
      const data = await executeTrade(requestId, accepted, walletAccountId);
      setResult(data);
      onNegotiationUpdate(data.negotiation || []);
      if (!accepted) {
        setResult({
          ...data,
          message: data.message || "Offer rejected",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade execution failed");
    } finally {
      setLoadingAction(null);
    }
  }

  const canAct = Boolean(requestId && offer && !offerError);

  return (
    <section className="panel-card p-5">
      <h2 className="panel-title">Trade Execution</h2>
      <p className="mt-1 text-sm text-slate-300/80">
        Review the latest market offer and choose accept or reject.
      </p>

      <div className="mt-4 space-y-3">
        <input
          value={requestId}
          readOnly
          className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-200"
        />

        {!requestId ? (
          <p className="text-sm text-slate-400">Enter a request ID to load offer details.</p>
        ) : null}

        {offerPolling ? <p className="text-xs text-slate-400">Refreshing offer...</p> : null}
        {offerError ? <p className="text-sm text-amber-300">{offerError}</p> : null}

        {offer ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-200">
            <p className="font-semibold text-cyan-100">Live Market Offer</p>
            <p className="mt-1">
              {offer.amount} {offer.token} @ {offer.price} {offer.buyToken ?? "HBAR"}
            </p>
            <p className="font-mono text-xs text-slate-400">Wallet: {offer.wallet}</p>
            {offer.notes ? <p className="mt-2 text-slate-300">{offer.notes}</p> : null}
          </div>
        ) : requestId && !offerError ? (
          <p className="text-sm text-slate-400">Waiting for market offer...</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg bg-emerald-400/85 px-4 py-2 font-medium text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
            type="button"
            onClick={() => {
              void submit(true);
            }}
            disabled={!canAct || loadingAction !== null || !isWalletConnected}
          >
            {loadingAction === "accept" ? "Executing..." : "Accept & Execute"}
          </button>
          <button
            className="rounded-lg bg-rose-400/85 px-4 py-2 font-medium text-slate-950 transition hover:bg-rose-300 disabled:opacity-60"
            type="button"
            onClick={() => {
              void submit(false);
            }}
            disabled={!canAct || loadingAction !== null}
          >
            {loadingAction === "reject" ? "Rejecting..." : "Reject Offer"}
          </button>
        </div>
      </div>

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
