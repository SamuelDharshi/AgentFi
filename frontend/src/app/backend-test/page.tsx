"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { backendHttpUrl, backendWsUrl } from "@/lib/observer";

type CheckResult = {
  ok: boolean;
  status: number;
  checkedAt: string;
  data?: unknown;
  error?: string;
};

type WsEvent = {
  at: string;
  raw: string;
};

function pretty(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function requestJson(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data?: unknown; error?: string }> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });

    const text = await response.text();
    let parsed: unknown = text;

    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data: parsed,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default function BackendTestPage() {
  const baseUrl = useMemo(() => backendHttpUrl(), []);
  const wsBaseUrl = useMemo(() => backendWsUrl(), []);
  const wsObserverUrl = `${wsBaseUrl}/observer`;

  const [healthResult, setHealthResult] = useState<CheckResult | null>(null);
  const [agentStatusResult, setAgentStatusResult] = useState<CheckResult | null>(null);
  const [snapshotResult, setSnapshotResult] = useState<CheckResult | null>(null);
  const [logResult, setLogResult] = useState<CheckResult | null>(null);
  const [chatResult, setChatResult] = useState<CheckResult | null>(null);
  const [offerResult, setOfferResult] = useState<CheckResult | null>(null);

  const [chatMessage, setChatMessage] = useState("Sell 10 USDC for HBAR");
  const [walletAddress, setWalletAddress] = useState(
    "0x2e842fa5de7fa61b3dc8748e00c540848d31e8f8"
  );
  const [requestId, setRequestId] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const [wsState, setWsState] = useState<"DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR">(
    "DISCONNECTED"
  );
  const [wsError, setWsError] = useState<string>("");
  const [wsEvents, setWsEvents] = useState<WsEvent[]>([]);

  function stamp(result: { ok: boolean; status: number; data?: unknown; error?: string }): CheckResult {
    return {
      ...result,
      checkedAt: new Date().toISOString(),
    };
  }

  async function checkHealth(): Promise<void> {
    const result = await requestJson(`${baseUrl}/health`);
    setHealthResult(stamp(result));
  }

  async function checkAgentStatus(): Promise<void> {
    const result = await requestJson(`${baseUrl}/agent-status`);
    setAgentStatusResult(stamp(result));
  }

  async function checkObserverSnapshot(): Promise<void> {
    const result = await requestJson(`${baseUrl}/observer/snapshot`);
    setSnapshotResult(stamp(result));
  }

  async function checkNegotiationLog(): Promise<void> {
    const result = await requestJson(`${baseUrl}/negotiation-log`);
    setLogResult(stamp(result));
  }

  async function runAllChecks(): Promise<void> {
    await checkHealth();
    await checkAgentStatus();
    await checkObserverSnapshot();
    await checkNegotiationLog();
  }

  async function submitChat(event: FormEvent): Promise<void> {
    event.preventDefault();

    const result = await requestJson(`${baseUrl}/chat`, {
      method: "POST",
      body: JSON.stringify({
        message: chatMessage,
        walletAddress,
        wallet: walletAddress,
      }),
    });

    setChatResult(stamp(result));

    if (result.ok && typeof result.data === "object" && result.data) {
      const maybeRequestId = (result.data as { requestId?: string }).requestId;
      if (maybeRequestId) {
        setRequestId(maybeRequestId);
      }
    }
  }

  async function fetchOffer(event: FormEvent): Promise<void> {
    event.preventDefault();

    const trimmed = requestId.trim();
    if (!trimmed) {
      setOfferResult(
        stamp({
          ok: false,
          status: 0,
          error: "requestId is required",
        })
      );
      return;
    }

    const result = await requestJson(
      `${baseUrl}/trade/offer?requestId=${encodeURIComponent(trimmed)}`
    );
    setOfferResult(stamp(result));
  }

  function connectWs(): void {
    if (socketRef.current) {
      return;
    }

    setWsState("CONNECTING");
    setWsError("");

    const socket = new WebSocket(wsObserverUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setWsState("CONNECTED");
    };

    socket.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      setWsEvents((prev) => {
        const next = [{ at: new Date().toISOString(), raw }, ...prev];
        return next.slice(0, 20);
      });
    };

    socket.onerror = () => {
      setWsState("ERROR");
      setWsError("WebSocket error. Ensure backend is running and /observer is available.");
    };

    socket.onclose = () => {
      socketRef.current = null;
      setWsState("DISCONNECTED");
    };
  }

  function disconnectWs(): void {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }

    socket.close();
    socketRef.current = null;
    setWsState("DISCONNECTED");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      <h1 className="font-(--font-orbitron) text-3xl text-slate-100">Backend Test Console</h1>
      <p className="mt-2 text-sm text-slate-300/90">
        Use this page to verify your live backend routes and WebSocket observer connection.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="panel-card p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Backend HTTP URL</p>
          <p className="mt-2 break-all text-sm text-cyan-200">{baseUrl}</p>
        </div>
        <div className="panel-card p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">Observer WebSocket URL</p>
          <p className="mt-2 break-all text-sm text-cyan-200">{wsObserverUrl}</p>
        </div>
      </div>

      <div className="mt-6 panel-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              void runAllChecks();
            }}
            className="btn-cyan"
          >
            Run Core Checks
          </button>
          <button
            type="button"
            onClick={() => {
              void checkHealth();
            }}
            className="btn-outline"
          >
            Health
          </button>
          <button
            type="button"
            onClick={() => {
              void checkAgentStatus();
            }}
            className="btn-outline"
          >
            Agent Status
          </button>
          <button
            type="button"
            onClick={() => {
              void checkObserverSnapshot();
            }}
            className="btn-outline"
          >
            Observer Snapshot
          </button>
          <button
            type="button"
            onClick={() => {
              void checkNegotiationLog();
            }}
            className="btn-outline"
          >
            Negotiation Log
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ResultCard title="GET /health" result={healthResult} />
        <ResultCard title="GET /agent-status" result={agentStatusResult} />
        <ResultCard title="GET /observer/snapshot" result={snapshotResult} />
        <ResultCard title="GET /negotiation-log" result={logResult} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="panel-card p-4">
          <h2 className="text-lg font-bold text-slate-100">POST /chat</h2>
          <p className="mt-1 text-xs text-slate-400">
            Sends a real trade-intent request. Requires valid OpenAI quota.
          </p>

          <form className="mt-4 space-y-3" onSubmit={(event) => void submitChat(event)}>
            <label className="block text-xs uppercase tracking-wider text-slate-300">
              Message
              <input
                value={chatMessage}
                onChange={(event) => setChatMessage(event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="block text-xs uppercase tracking-wider text-slate-300">
              Wallet Address
              <input
                value={walletAddress}
                onChange={(event) => setWalletAddress(event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <button type="submit" className="btn-cyan">
              Send Chat Request
            </button>
          </form>

          <ResultBlock result={chatResult} />
        </section>

        <section className="panel-card p-4">
          <h2 className="text-lg font-bold text-slate-100">GET /trade/offer</h2>
          <p className="mt-1 text-xs text-slate-400">
            Use requestId from chat response to fetch the live offer.
          </p>

          <form className="mt-4 space-y-3" onSubmit={(event) => void fetchOffer(event)}>
            <label className="block text-xs uppercase tracking-wider text-slate-300">
              Request ID
              <input
                value={requestId}
                onChange={(event) => setRequestId(event.target.value)}
                className="mt-1 w-full rounded border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"
              />
            </label>
            <button type="submit" className="btn-cyan">
              Fetch Offer
            </button>
          </form>

          <ResultBlock result={offerResult} />
        </section>
      </div>

      <section className="mt-6 panel-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-100">WebSocket /observer</h2>
            <p className="mt-1 text-xs text-slate-400">Real-time observer stream from backend.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-2 py-1 text-xs font-bold ${
                wsState === "CONNECTED"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : wsState === "CONNECTING"
                    ? "bg-amber-500/20 text-amber-300"
                    : wsState === "ERROR"
                      ? "bg-rose-500/20 text-rose-300"
                      : "bg-slate-500/20 text-slate-300"
              }`}
            >
              {wsState}
            </span>
            <button type="button" onClick={connectWs} className="btn-outline">
              Connect
            </button>
            <button type="button" onClick={disconnectWs} className="btn-outline">
              Disconnect
            </button>
          </div>
        </div>

        {wsError && <p className="mt-3 text-sm text-rose-300">{wsError}</p>}

        <div className="mt-4 rounded border border-slate-700 bg-slate-950/80 p-3">
          <p className="text-xs uppercase tracking-wider text-slate-400">Latest Events (max 20)</p>
          {wsEvents.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No events yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {wsEvents.map((event, index) => (
                <li key={`${event.at}-${index}`} className="rounded border border-slate-800 p-2">
                  <p className="text-[11px] text-slate-500">{event.at}</p>
                  <pre className="mt-1 overflow-x-auto text-xs text-slate-200">{event.raw}</pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function ResultCard({ title, result }: { title: string; result: CheckResult | null }) {
  return (
    <section className="panel-card p-4">
      <h2 className="text-lg font-bold text-slate-100">{title}</h2>
      <ResultBlock result={result} />
    </section>
  );
}

function ResultBlock({ result }: { result: CheckResult | null }) {
  if (!result) {
    return <p className="mt-3 text-sm text-slate-500">Not checked yet.</p>;
  }

  return (
    <div className="mt-3 rounded border border-slate-700 bg-slate-950/80 p-3">
      <p className={`text-xs font-bold ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>
        {result.ok ? "PASS" : "FAIL"} | status={result.status} | at={result.checkedAt}
      </p>
      {result.error && <p className="mt-1 text-xs text-rose-300">{result.error}</p>}
      {result.data !== undefined && (
        <pre className="mt-2 max-h-72 overflow-auto text-xs text-slate-200">{pretty(result.data)}</pre>
      )}
    </div>
  );
}
