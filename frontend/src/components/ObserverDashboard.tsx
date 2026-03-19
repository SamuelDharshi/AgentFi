"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { TradeMessage } from "@/lib/api";
import {
  ObserverEvent,
  ObserverFlowState,
  ObserverHcsEvent,
  ObserverStateEvent,
  backendWsUrl,
  configuredMarketAgentAddresses,
  getObserverSnapshot,
} from "@/lib/observer";
import { ObserverCanvas } from "./ObserverCanvas";
import { FlowStateTracker } from "./FlowStateTracker";
import { ReputationBoard } from "./ReputationBoard";

type WsStatus = "connecting" | "connected" | "reconnecting" | "error";

interface FeedEntry {
  id: string;
  at: number;
  lane: "hcs" | "trade" | "state";
  title: string;
  detail: string;
}

function describeTrade(message: TradeMessage): { title: string; detail: string } {
  const p = message.payload;
  const titleMap: Record<TradeMessage["type"], string> = {
    TRADE_REQUEST: "Trade Request",
    TRADE_OFFER: "Market Offer",
    TRADE_ACCEPT: "Trade Accepted",
    TRADE_EXECUTED: "Trade Settled",
  };

  return {
    title: titleMap[message.type],
    detail:
      `${p.amount} ${p.token} -> ${p.buyToken ?? "HBAR"} @ ${p.price}` +
      ` | req=${p.requestId}` +
      (p.notes ? ` | ${p.notes}` : ""),
  };
}

function describeState(event: ObserverStateEvent): FeedEntry {
  return {
    id: `state-${event.at}-${event.flowState}`,
    at: event.at,
    lane: "state",
    title: `Flow -> ${event.flowState}`,
    detail: event.reason || "state transition observed",
  };
}

function describeHcs(event: ObserverHcsEvent): FeedEntry {
  const o = event.observation;
  return {
    id: `hcs-${event.at}-${o.sequenceNumber}-${o.requestId}`,
    at: event.at,
    lane: "hcs",
    title: `HCS seq=${o.sequenceNumber} verified=${o.signatureVerified}`,
    detail:
      `request=${o.requestId} sender=${o.sender}` +
      ` ts=${o.consensusTimestamp}` +
      (o.dropped ? ` dropped(${o.reason ?? "unknown"})` : ""),
  };
}

function pushFeedEntry(
  setter: Dispatch<SetStateAction<FeedEntry[]>>,
  entry: FeedEntry
): void {
  setter((prev) => [entry, ...prev].slice(0, 160));
}

export function ObserverDashboard() {
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [flowState, setFlowState] = useState<ObserverFlowState>("Discovering");
  const [flowReason, setFlowReason] = useState<string | undefined>();
  const [flowUpdatedAt, setFlowUpdatedAt] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [negotiationCount, setNegotiationCount] = useState(0);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [marketAgents, setMarketAgents] = useState<string[]>(
    configuredMarketAgentAddresses()
  );

  const applyObserverEvent = useCallback((event: ObserverEvent) => {
    if (event.type === "snapshot") {
      setFlowState(event.flowState);
      setFlowUpdatedAt(event.at);
      setTopicId(event.topicId);
      setNegotiationCount(event.negotiationCount);
      setLastMessageAt(event.lastMessageAt);
      setMarketAgents((prev) =>
        Array.from(new Set([...prev, ...event.activeMarketAgents]))
      );

      const snapshotFeed = event.messages
        .slice(-80)
        .map((message, index) => {
          const desc = describeTrade(message);
          return {
            id: `snap-${message.payload.requestId}-${message.type}-${index}`,
            at: message.payload.timestamp,
            lane: "trade" as const,
            title: desc.title,
            detail: desc.detail,
          };
        })
        .reverse();

      setFeed(snapshotFeed);
      return;
    }

    if (event.type === "state") {
      setFlowState(event.flowState);
      setFlowReason(event.reason);
      setFlowUpdatedAt(event.at);
      pushFeedEntry(setFeed, describeState(event));
      return;
    }

    if (event.type === "trade") {
      const desc = describeTrade(event.message);
      setNegotiationCount((prev) => prev + 1);
      setLastMessageAt(event.at);

      pushFeedEntry(setFeed, {
        id: `trade-${event.at}-${event.message.type}-${event.message.payload.requestId}`,
        at: event.at,
        lane: "trade",
        title: `${desc.title} (${event.source})`,
        detail: desc.detail,
      });
      return;
    }

    if (event.type === "hcs") {
      setLastMessageAt(event.at);
      setMarketAgents((prev) =>
        Array.from(new Set([...prev, event.observation.sender]))
      );
      pushFeedEntry(setFeed, describeHcs(event));
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (disposed) return;

      setWsStatus((prev) => (prev === "connected" ? "connected" : "connecting"));

      try {
        const snapshot = await getObserverSnapshot();
        if (!disposed) {
          applyObserverEvent(snapshot);
        }
      } catch {
        // Snapshot is optional; websocket stream is authoritative.
      }

      const ws = new WebSocket(`${backendWsUrl()}/observer`);
      socket = ws;

      ws.onopen = () => {
        if (disposed) return;
        setWsStatus("connected");
      };

      ws.onmessage = (message) => {
        if (disposed) return;
        try {
          const parsed = JSON.parse(String(message.data)) as ObserverEvent;
          if (parsed && typeof parsed.type === "string") {
            applyObserverEvent(parsed);
          }
        } catch {
          // Ignore malformed packets.
        }
      };

      ws.onerror = () => {
        if (disposed) return;
        setWsStatus("error");
      };

      ws.onclose = () => {
        if (disposed) return;
        setWsStatus("reconnecting");
        retryTimer = setTimeout(() => {
          void connect();
        }, 1800);
      };
    };

    void connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (socket) socket.close();
    };
  }, [applyObserverEvent]);

  const statusTone = useMemo(() => {
    if (wsStatus === "connected") return "text-emerald-300";
    if (wsStatus === "error") return "text-amber-300";
    return "text-violet-300";
  }, [wsStatus]);

  return (
    <main className="mx-auto max-w-325 px-4 pb-8 pt-6 md:px-8">
      <section className="mb-6 rounded-2xl border border-violet-400/30 bg-slate-950/70 p-6 shadow-[0_0_80px_rgba(124,58,237,0.15)] backdrop-blur">
        <p className="font-mono text-xs uppercase tracking-[0.26em] text-violet-300/90">
          Autonomous Society Observer Dashboard
        </p>
        <h1 className="mt-2 font-(--font-orbitron) text-3xl text-slate-100 md:text-4xl">
          AgentFi Terminal
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-300/80 md:text-base">
          Human-facing read-only monitor for OpenClaw agents negotiating and settling OTC trades over HCS.
        </p>

        <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
          <div className="panel-chip-wrap">
            <p className="panel-label">WebSocket</p>
            <p className={statusTone}>{wsStatus}</p>
          </div>
          <div className="panel-chip-wrap">
            <p className="panel-label">Topic</p>
            <p className="font-mono text-slate-100">{topicId ?? "not-ready"}</p>
          </div>
          <div className="panel-chip-wrap">
            <p className="panel-label">Negotiations</p>
            <p className="font-mono text-slate-100">{negotiationCount}</p>
          </div>
          <div className="panel-chip-wrap">
            <p className="panel-label">Last Activity</p>
            <p className="font-mono text-slate-100">
              {lastMessageAt ? new Date(lastMessageAt).toLocaleTimeString() : "waiting"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <ObserverCanvas />
        <div className="space-y-5">
          <FlowStateTracker
            current={flowState}
            reason={flowReason}
            updatedAt={flowUpdatedAt}
          />
          <ReputationBoard marketAgents={marketAgents} />
        </div>
      </section>

      <section className="panel-card mt-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="panel-title">Live UCP/HCS Feed</h2>
          <span className="panel-chip">ws /observer</span>
        </div>

        <div className="max-h-95 space-y-2 overflow-y-auto pr-1">
          {feed.length === 0 ? (
            <p className="text-sm text-slate-400">Waiting for stream events...</p>
          ) : (
            feed.map((entry) => (
              <article
                key={entry.id}
                className="rounded-lg border border-slate-700 bg-slate-900/70 p-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <p
                    className={[
                      "text-sm font-semibold",
                      entry.lane === "hcs"
                        ? "text-violet-200"
                        : entry.lane === "state"
                          ? "text-violet-200"
                          : "text-emerald-200",
                    ].join(" ")}
                  >
                    {entry.title}
                  </p>
                  <p className="font-mono text-xs text-slate-400">
                    {new Date(entry.at).toLocaleTimeString()}
                  </p>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-slate-300/90">
                  {entry.detail}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
