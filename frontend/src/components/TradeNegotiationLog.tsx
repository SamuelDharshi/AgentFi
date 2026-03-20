"use client";

import { useEffect, useMemo, useState } from "react";
import { getNegotiationLog, TradeMessage } from "@/lib/api";

interface TradeNegotiationLogProps {
  requestId: string | null;
}

const LABELS: Record<TradeMessage["type"], string> = {
  TRADE_REQUEST: "Request",
  TRADE_OFFER: "Offer",
  TRADE_ACCEPT: "Accept",
  TRADE_EXECUTED: "Executed",
};

const TONES: Record<TradeMessage["type"], string> = {
  TRADE_REQUEST: "border-amber-400/20 bg-amber-400/10 text-amber-100",
  TRADE_OFFER: "border-cyan-400/20 bg-cyan-400/10 text-cyan-100",
  TRADE_ACCEPT: "border-violet-400/20 bg-violet-400/10 text-violet-100",
  TRADE_EXECUTED: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
};

function formatMessage(entry: TradeMessage): string {
  const { payload } = entry;
  return `${payload.amount} ${payload.token} @ ${payload.price.toFixed(6)}`;
}

export function TradeNegotiationLog({ requestId }: TradeNegotiationLogProps) {
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await getNegotiationLog();
        if (!active) {
          return;
        }

        setMessages(data);
        setError(null);
      } catch (err) {
        if (!active) {
          return;
        }

        setError(err instanceof Error ? err.message : "Failed to fetch negotiation log");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const visibleMessages = useMemo(() => {
    const relevant = requestId
      ? messages.filter((entry) => entry.payload.requestId === requestId)
      : messages;

    return relevant.slice(-12);
  }, [messages, requestId]);

  return (
    <section className="rounded-[28px] border border-violet-400/20 bg-black/50 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.7)] backdrop-blur-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Trade console</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Negotiation log</h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[0.65rem] font-mono uppercase tracking-[0.28em] text-slate-300">
          {requestId ? `Request ${requestId.slice(0, 10)}…` : "All requests"}
        </span>
      </div>

      {loading && visibleMessages.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">Loading negotiation history...</p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-amber-200">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {visibleMessages.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-black/30 p-5 text-sm text-slate-400">
            No negotiation events yet. Once a trade is requested, every message in the flow appears here.
          </div>
        ) : (
          visibleMessages.map((entry) => {
            const tone = TONES[entry.type];

            return (
              <div key={`${entry.type}-${entry.payload.requestId}-${entry.payload.timestamp}`} className="rounded-3xl border border-white/10 bg-black/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.28em] ${tone}`}>
                      {LABELS[entry.type]}
                    </span>
                    <p className="mt-3 text-sm font-semibold text-white">{formatMessage(entry)}</p>
                  </div>
                  <span className="font-mono text-xs text-slate-400">
                    {new Date(entry.payload.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Wallet</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-200">{entry.payload.wallet}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Request</p>
                    <p className="mt-2 break-all font-mono text-xs text-slate-200">{entry.payload.requestId}</p>
                  </div>
                </div>

                {entry.payload.notes ? (
                  <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-relaxed text-slate-200/90">
                    {entry.payload.notes}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
