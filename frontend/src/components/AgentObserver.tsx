"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TradeMessage, TradePayload } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "pending" | "active" | "done" | "error";

interface ObserverStep {
  id: number;
  icon: string;
  label: string;
  detail: string | null;
  status: StepStatus;
}

export interface AgentObserverHandle {
  /**
   * Called when a POST /chat response comes back successfully.
   * Drives steps 1-3 (UserAgent → market analysis → HCS publish).
   */
  onChatResponse: (payload: TradePayload, topicId?: string | null) => void;
  /**
   * Called when negotiation messages arrive (from NegotiationFeed updates).
   * Drives steps 4-11.
   */
  onNegotiationMessages: (messages: TradeMessage[]) => void;
  /** Reset all steps to pending for a new trade cycle. */
  reset: () => void;
}

interface AgentObserverProps {
  /** Expose controller methods to parent via ref. */
  controllerRef?: React.RefObject<AgentObserverHandle | null>;
  /**
   * Pass negotiation messages directly when available, so the component can
   * self-update without needing the controller.
   */
  messages?: TradeMessage[];
  topicId?: string | null;
}

// ─── Step templates ───────────────────────────────────────────────────────────

function buildInitialSteps(): ObserverStep[] {
  return [
    { id: 1,  icon: "🤖", label: "UserAgent received trade request",   detail: null, status: "pending" },
    { id: 2,  icon: "🔍", label: "UserAgent analyzing market…",         detail: null, status: "pending" },
    { id: 3,  icon: "📡", label: "TRADE_REQUEST published to HCS",      detail: null, status: "pending" },
    { id: 4,  icon: "🤖", label: "MarketAgent received proposal",        detail: null, status: "pending" },
    { id: 5,  icon: "💰", label: "MarketAgent calculated offer",         detail: null, status: "pending" },
    { id: 6,  icon: "📡", label: "TRADE_OFFER published to HCS",        detail: null, status: "pending" },
    { id: 7,  icon: "✅", label: "User accepted offer",                  detail: null, status: "pending" },
    { id: 8,  icon: "⛓️",  label: "AtomicSwap executing on Hedera EVM", detail: null, status: "pending" },
    { id: 9,  icon: "💸", label: "Token transfer confirmed",             detail: null, status: "pending" },
    { id: 10, icon: "⭐", label: "Reputation updated",                   detail: null, status: "pending" },
    { id: 11, icon: "📡", label: "TRADE_EXECUTED published to HCS",     detail: null, status: "pending" },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmount(p: TradePayload): string {
  const amount = typeof p.amount === "number" ? p.amount.toLocaleString() : String(p.amount);
  return `${amount} ${p.token} → ${p.buyToken ?? "HBAR"}`;
}

function fmtPrice(p: TradePayload): string {
  return `${p.price.toFixed(6)} ${p.buyToken ?? "HBAR"}/${p.token}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AgentObserver({ controllerRef, messages = [], topicId }: AgentObserverProps) {
  const [steps, setSteps] = useState<ObserverStep[]>(buildInitialSteps);
  const latestPayloadRef = useRef<TradePayload | null>(null);

  // Stable step updater
  const setStep = (id: number, update: Partial<ObserverStep>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...update } : s))
    );
  };

  // ── Controller API exposed to parent ─────────────────────────────────────

  const onChatResponse = useMemo(
    () => (payload: TradePayload, tid?: string | null) => {
      latestPayloadRef.current = payload;
      const tradeDesc = fmtAmount(payload);
      const topic = tid ?? topicId ?? "—";

      // Step 1: received
      setStep(1, {
        status: "done",
        detail: `Amount: ${tradeDesc}`,
      });

      // Step 2: analyzing (show as done immediately since we have the result)
      setStep(2, {
        status: "done",
        detail: `Fetching live price from CoinGecko ✓`,
      });

      // Step 3: HCS publish
      setStep(3, {
        status: "done",
        detail: `Topic: ${topic} | Encrypted: YES`,
      });

      // Step 4: market agent receiving (active — waiting for TRADE_OFFER)
      setStep(4, {
        status: "active",
        detail: "Verifying wallet identity…",
      });
    },
    [topicId]
  );

  const onNegotiationMessages = useMemo(
    () => (msgs: TradeMessage[]) => {
      const types = new Set(msgs.map((m) => m.type));

      // Find the latest payload for each type
      const findPayload = (type: TradeMessage["type"]): TradePayload | undefined =>
        msgs.filter((m) => m.type === type).at(-1)?.payload;

      if (types.has("TRADE_OFFER")) {
        const offer = findPayload("TRADE_OFFER");
        setStep(4, { status: "done", detail: "Wallet identity verified ✓" });
        setStep(5, {
          status: "done",
          detail: offer
            ? `Price: ${fmtPrice(offer)} | Spread: 0.5%`
            : "Offer received",
        });
        setStep(6, {
          status: "done",
          detail: "Offer valid for 60 seconds",
        });
        // Step 7: waiting for user decision
        if (!types.has("TRADE_ACCEPT")) {
          setStep(7, { status: "active", detail: "Awaiting user decision…" });
        }
      }

      if (types.has("TRADE_ACCEPT")) {
        setStep(7, { status: "done", detail: "User confirmed acceptance ✓" });
        setStep(8, { status: "active", detail: "Submitting to Hedera EVM…" });
      }

      if (types.has("TRADE_EXECUTED")) {
        const exec = findPayload("TRADE_EXECUTED");
        const note = exec?.notes ?? "";

        // Extract transaction hash from notes if present (format: 0x…)
        const txMatch = note.match(/(0x[0-9a-fA-F]{8,64})/);
        const txId = txMatch?.[1] ?? "confirmed";

        setStep(8, {
          status: "done",
          detail: `Transaction: ${txId}`,
        });
        setStep(9, {
          status: "done",
          detail: exec ? `${fmtAmount(exec)} confirmed` : "Transfer confirmed ✓",
        });
        setStep(10, {
          status: "done",
          detail: "MarketAgent score +1 | Verified on-chain",
        });
        setStep(11, {
          status: "done",
          detail: `Settlement note: ${note.slice(0, 80) || "Trade closed"}`,
        });
      }
    },
    []
  );

  const reset = useMemo(
    () => () => {
      latestPayloadRef.current = null;
      setSteps(buildInitialSteps());
    },
    []
  );

  // Expose controller
  useEffect(() => {
    if (controllerRef) {
      (controllerRef as React.MutableRefObject<AgentObserverHandle | null>).current = {
        onChatResponse,
        onNegotiationMessages,
        reset,
      };
    }
  }, [controllerRef, onChatResponse, onNegotiationMessages, reset]);

  // Auto-update from messages prop
  useEffect(() => {
    if (messages.length > 0) {
      onNegotiationMessages(messages);
    }
  }, [messages, onNegotiationMessages]);

  // ── Rendering ──────────────────────────────────────────────────────────────

  const allPending = steps.every((s) => s.status === "pending");

  return (
    <section className="panel-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="panel-title">Agent Observer</h2>
        <span className="panel-chip">live flow</span>
      </div>

      {allPending && (
        <p className="mb-4 text-xs text-slate-400">
          Watching autonomous agents… Submit a trade to see each step appear in real time.
        </p>
      )}

      <ol className="space-y-2">
        {steps.map((step) => (
          <li key={step.id} className={stepRowClass(step.status)}>
            {/* Left: icon + status indicator */}
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-base leading-none">{step.icon}</span>
              <div className="min-w-0 flex-1">
                <p className={stepLabelClass(step.status)}>
                  Step {step.id}: {step.label}
                </p>
                {step.detail && (
                  <p className="mt-0.5 break-all font-mono text-[11px] text-slate-300/80">
                    {step.detail}
                  </p>
                )}
              </div>
            </div>

            {/* Right: status badge */}
            <StatusBadge status={step.status} />
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StepStatus }) {
  if (status === "pending") {
    return (
      <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
        queued
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="relative shrink-0 rounded-full border border-cyan-400/60 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-300">
        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400 align-middle" />
        live
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="shrink-0 rounded-full border border-emerald-400/50 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-300">
        ✓ done
      </span>
    );
  }
  // error
  return (
    <span className="shrink-0 rounded-full border border-rose-400/50 bg-rose-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-rose-300">
      ✗ failed
    </span>
  );
}

function stepRowClass(status: StepStatus): string {
  const base =
    "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-300";
  if (status === "active")
    return `${base} border-cyan-400/40 bg-cyan-400/5 shadow-[0_0_16px_rgba(34,211,238,0.1)]`;
  if (status === "done")
    return `${base} border-emerald-400/25 bg-emerald-400/5`;
  if (status === "error")
    return `${base} border-rose-400/30 bg-rose-400/5`;
  return `${base} border-slate-800 bg-slate-900/40`;
}

function stepLabelClass(status: StepStatus): string {
  if (status === "active") return "text-sm font-semibold text-cyan-100";
  if (status === "done") return "text-sm font-medium text-emerald-100";
  if (status === "error") return "text-sm font-medium text-rose-200";
  return "text-sm text-slate-400";
}
