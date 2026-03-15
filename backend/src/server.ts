import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { onTradeRequest } from "./agents/marketAgent";
import {
  HcsBridgeObservation,
  receiveTradeRequest,
  sendTradeAccept,
  sendTradeExecuted,
  sendTradeRequest,
  startHcsBridge,
} from "./agents/communication";
import { buildTradeRequest } from "./agents/userAgent";
import { createTopic, isHederaConfigured } from "./hedera/client";
import { startOpenClawAutonomy, stopOpenClawAutonomy } from "./openclaw";
import { executeTrade } from "./trade/executor";
import { AgentStatus, TradeMessage, TradePayload } from "./types/messages";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

type ObserverFlowState = "Discovering" | "Negotiating" | "Executing" | "Settled";

type ObserverEvent =
  | {
      type: "snapshot";
      at: number;
      flowState: ObserverFlowState;
      topicId: string | null;
      lastMessageAt: number | null;
      negotiationCount: number;
      activeMarketAgents: string[];
      messages: TradeMessage[];
    }
  | {
      type: "state";
      at: number;
      flowState: ObserverFlowState;
      reason?: string;
    }
  | {
      type: "trade";
      at: number;
      source: "bridge" | "local" | "api";
      message: TradeMessage;
    }
  | {
      type: "hcs";
      at: number;
      observation: HcsBridgeObservation;
    };

let topicId = process.env.HEDERA_TOPIC_ID || "";
let lastMessageAt: number | null = null;
const negotiationLog: TradeMessage[] = [];
const offers = new Map<string, TradePayload>();
const wsClients = new Set<WebSocket>();
const activeMarketAgents = new Set<string>();
let flowState: ObserverFlowState = "Discovering";

const configuredMarketAgent = (process.env.MARKET_AGENT_EVM_ADDRESS ?? "").trim();
if (configuredMarketAgent) {
  activeMarketAgents.add(configuredMarketAgent.toLowerCase());
}

function emitObserverEvent(event: ObserverEvent): void {
  const serialized = JSON.stringify(event);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

function observerSnapshot(): ObserverEvent {
  return {
    type: "snapshot",
    at: Date.now(),
    flowState,
    topicId: topicId || null,
    lastMessageAt,
    negotiationCount: negotiationLog.length,
    activeMarketAgents: Array.from(activeMarketAgents),
    messages: negotiationLog.slice(-120),
  };
}

function setFlowState(next: ObserverFlowState, reason?: string): void {
  if (next === flowState && !reason) {
    return;
  }

  flowState = next;
  emitObserverEvent({
    type: "state",
    at: Date.now(),
    flowState,
    reason,
  });
}

function inferFlowState(type: TradeMessage["type"]): ObserverFlowState | null {
  if (type === "TRADE_REQUEST" || type === "TRADE_OFFER") {
    return "Negotiating";
  }
  if (type === "TRADE_ACCEPT") {
    return "Executing";
  }
  if (type === "TRADE_EXECUTED") {
    return "Settled";
  }
  return null;
}

function appendNegotiationMessage(
  message: TradeMessage,
  source: "bridge" | "local" | "api"
): void {
  negotiationLog.push(message);
  if (negotiationLog.length > 500) {
    negotiationLog.splice(0, negotiationLog.length - 500);
  }

  lastMessageAt = Date.now();

  if (configuredMarketAgent && message.type !== "TRADE_REQUEST") {
    activeMarketAgents.add(configuredMarketAgent.toLowerCase());
  }

  emitObserverEvent({
    type: "trade",
    at: Date.now(),
    source,
    message,
  });

  const inferred = inferFlowState(message.type);
  if (inferred) {
    setFlowState(inferred);
  }
}

receiveTradeRequest(async (message) => {
  appendNegotiationMessage(message, "bridge");

  const offer = await onTradeRequest(topicId, message);
  if (offer) {
    offers.set(offer.requestId, offer);
    appendNegotiationMessage(
      {
      type: "TRADE_OFFER",
      payload: offer,
      },
      "local"
    );
  }
});

app.post("/chat", async (req, res) => {
  try {
    const userText = String(req.body.message || "");
    const wallet = String(req.body.wallet || "0.0.5005");

    const { payload, analysis } = await buildTradeRequest(userText, wallet);
    await sendTradeRequest(topicId, payload);

    res.json({
      message: "Trade request created and sent to market agent",
      analysis,
      tradeRequest: payload,
      negotiation: negotiationLog,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to process chat",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post("/trade", async (req, res) => {
  try {
    const requestId = String(req.body.requestId || "");
    const accepted = Boolean(req.body.accepted);

    const offer = offers.get(requestId);
    if (!offer) {
      return res.status(404).json({ error: "Offer not found" });
    }

    if (!accepted) {
      return res.json({ executed: false, message: "Trade declined by user" });
    }

    await sendTradeAccept(topicId, {
      ...offer,
      timestamp: Date.now(),
      notes: "User accepted market offer",
    });

    const execution = await executeTrade(offer);

    await sendTradeExecuted(topicId, {
      ...offer,
      timestamp: Date.now(),
      notes: execution.settlement,
    });

    appendNegotiationMessage(
      {
        type: "TRADE_EXECUTED",
        payload: {
          ...offer,
          timestamp: Date.now(),
          notes: execution.transactionId,
        },
      },
      "api"
    );

    return res.json({
      executed: execution.executed,
      transactionId: execution.transactionId,
      settlement: execution.settlement,
      negotiation: negotiationLog,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to execute trade",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/agent-status", (_req, res) => {
  const status: AgentStatus = {
    userAgentOnline: true,
    marketAgentOnline: true,
    hederaConnected: isHederaConfigured(),
    topicId: topicId || null,
    lastMessageAt,
  };

  res.json({
    ...status,
    negotiationCount: negotiationLog.length,
  });
});

app.get("/negotiation-log", (_req, res) => {
  res.json(negotiationLog);
});

app.get("/observer/snapshot", (_req, res) => {
  res.json(observerSnapshot());
});

async function bootstrap(): Promise<void> {
  if (!topicId) {
    topicId = await createTopic("AgentFi OTC Negotiation Topic");
  }
  setFlowState("Discovering", `topic=${topicId}`);

  // Bridge live HCS messages into the in-process negotiation bus.
  // No-op when MOCK_HEDERA=true.
  startHcsBridge(topicId, (observation) => {
    emitObserverEvent({
      type: "hcs",
      at: Date.now(),
      observation,
    });

    if (!observation.dropped) {
      setFlowState(
        "Negotiating",
        `hcs seq=${observation.sequenceNumber} verified=${observation.signatureVerified}`
      );
    }
  });

  // Start autonomous OpenClaw heartbeat skill when OPENCLAW_AUTONOMOUS=true.
  await startOpenClawAutonomy(topicId);

  const port = Number(process.env.PORT || 4000);
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/observer" });

  wss.on("connection", (socket) => {
    wsClients.add(socket);
    socket.send(JSON.stringify(observerSnapshot()));

    socket.on("close", () => {
      wsClients.delete(socket);
    });
  });

  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `AgentFi backend running on port ${port}; topic=${topicId}; observer=ws://localhost:${port}/observer`
    );
  });

  // Graceful shutdown for long-running autonomous skills.
  const shutdown = async () => {
    await stopOpenClawAutonomy();

    for (const client of wsClients) {
      client.close();
    }
    wsClients.clear();

    wss.close(() => {
      httpServer.close(() => process.exit(0));
    });
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Backend bootstrap failed", error);
  process.exit(1);
});
