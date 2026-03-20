import "dotenv/config";
import cors from "cors";
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
import {
  createTopic,
  isHederaConfigured,
  waitForTopicAvailability,
} from "./hedera/client";
import { startOpenClawAutonomy, stopOpenClawAutonomy } from "./openclaw";
import { executeTrade } from "./trade/executor";
import { AgentStatus, TradeMessage, TradePayload } from "./types/messages";

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

let topicId = "";
let lastMessageAt: number | null = null;
const negotiationLog: TradeMessage[] = [];
const offers = new Map<string, TradePayload>();
const wsClients = new Set<WebSocket>();
const activeMarketAgents = new Set<string>();
let flowState: ObserverFlowState = "Discovering";

function configuredMarketAgentAddress(): string {
  return (process.env.MARKET_AGENT_EVM_ADDRESS ?? "").trim().toLowerCase();
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

function isDuplicateNegotiationMessage(message: TradeMessage): boolean {
  // We scan only the recent tail because duplicates are immediate HCS echoes.
  const recentWindowStart = Math.max(0, negotiationLog.length - 100);
  for (let i = negotiationLog.length - 1; i >= recentWindowStart; i -= 1) {
    const existing = negotiationLog[i];
    if (existing.type !== message.type) {
      continue;
    }

    const a = existing.payload;
    const b = message.payload;
    if (
      a.requestId === b.requestId &&
      a.wallet === b.wallet &&
      a.token === b.token &&
      a.amount === b.amount &&
      a.price === b.price &&
      (a.buyToken ?? "") === (b.buyToken ?? "") &&
      a.timestamp === b.timestamp &&
      (a.notes ?? "") === (b.notes ?? "")
    ) {
      return true;
    }
  }

  return false;
}

function appendNegotiationMessage(
  message: TradeMessage,
  source: "bridge" | "local" | "api"
): void {
  if (isDuplicateNegotiationMessage(message)) {
    return;
  }

  negotiationLog.push(message);
  if (negotiationLog.length > 500) {
    negotiationLog.splice(0, negotiationLog.length - 500);
  }

  lastMessageAt = Date.now();

  const configuredMarketAgent = configuredMarketAgentAddress();
  if (configuredMarketAgent && message.type !== "TRADE_REQUEST") {
    activeMarketAgents.add(configuredMarketAgent);
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

function getNegotiationForRequest(requestId: string): TradeMessage[] {
  return negotiationLog.filter((entry) => entry.payload.requestId === requestId);
}

receiveTradeRequest(async (message) => {
  try {
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
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`Failed to process trade request message: ${details}`);
  }
});

app.post("/chat", async (req, res) => {
  try {
    const userText = String(req.body.message ?? "").trim();
    const wallet = String(req.body.walletAddress ?? req.body.wallet ?? "").trim();

    if (!userText) {
      return res.status(400).json({ error: "Please specify an amount. Example: Sell 100 USDC for HBAR" });
    }

    if (!wallet) {
      return res.status(400).json({ error: "wallet is required" });
    }

    const { payload, analysis } = await buildTradeRequest(userText, wallet);
    await sendTradeRequest(topicId, payload);

    res.json({
      requestId: payload.requestId,
      analysis: analysis.reasoning,
      amount: payload.amount,
      sellToken: payload.token,
      buyToken: payload.buyToken ?? "HBAR",
      currentPrice: analysis.recommendedPrice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // Check if it's a missing amount error
    if (message.includes("amount must be a positive number")) {
      return res.status(400).json({ error: "Please specify an amount. Example: Sell 100 USDC for HBAR" });
    }
    
    // Check if it's a zero/negative amount error
    if (message.includes("amount must be a positive") || message.includes("Amount must be greater than 0")) {
      return res.status(400).json({ error: "Amount must be greater than 0" });
    }

    res.status(500).json({
      error: "Failed to process chat",
      details: message,
    });
  }
});

app.post("/trade", async (req, res) => {
  try {
    const requestId = String(req.body.requestId ?? "").trim();
    const acceptedRaw = req.body.accepted;
    const walletAddress = String(req.body.walletAddress ?? req.body.wallet ?? "").trim();

    if (!requestId) {
      return res.status(400).json({ error: "requestId is required" });
    }

    if (typeof acceptedRaw !== "boolean") {
      return res.status(400).json({ error: "accepted must be a boolean" });
    }

    const accepted = acceptedRaw;

    const offer = offers.get(requestId);
    if (!offer) {
      return res.status(404).json({ error: "Offer not found" });
    }

    if (accepted && !walletAddress) {
      return res.status(400).json({ error: "walletAddress is required when accepted=true" });
    }

    if (accepted && walletAddress && walletAddress.toLowerCase() !== offer.wallet.toLowerCase()) {
      return res.status(403).json({ error: "walletAddress does not match offer wallet" });
    }

    if (!accepted) {
      offers.delete(requestId);
      return res.json({
        executed: false,
        message: "Trade declined by user",
        negotiation: getNegotiationForRequest(requestId),
      });
    }

    const acceptedPayload: TradePayload = {
      ...offer,
      timestamp: Date.now(),
      notes: "User accepted market offer",
    };

    await sendTradeAccept(topicId, acceptedPayload);
    appendNegotiationMessage(
      {
        type: "TRADE_ACCEPT",
        payload: acceptedPayload,
      },
      "api"
    );

    const execution = await executeTrade(offer);

    const executedPayload: TradePayload = {
      ...offer,
      timestamp: Date.now(),
      notes: execution.settlement,
    };

    await sendTradeExecuted(topicId, executedPayload);

    appendNegotiationMessage(
      {
        type: "TRADE_EXECUTED",
        payload: executedPayload,
      },
      "api"
    );

    offers.delete(requestId);

    return res.json({
      executed: execution.executed,
      success: execution.executed,
      transactionId: execution.transactionId,
      txHash: execution.transactionId,
      usdcSent: offer.token === "USDC" ? offer.amount : offer.amount * offer.price,
      hbarReceived: offer.token === "USDC" ? offer.amount / offer.price : offer.amount,
      settlement: execution.settlement,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to execute trade",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/trade/offer", (req, res) => {
  const requestId = String(req.query.requestId ?? "").trim();
  if (!requestId) {
    return res.status(400).json({ error: "requestId query param is required" });
  }

  const offer = offers.get(requestId);
  if (!offer) {
    // eslint-disable-next-line no-console
    console.log(`❌ Offer NOT found: ${requestId}`);
    return res.status(404).json({ error: "Offer not found" });
  }

  // eslint-disable-next-line no-console
  console.log(`✅ Offer found: ${requestId}`);

  // Calculate spread as percentage
  const spread = ((offer.price / offer.price) - 1) * 100; // Spread is 0.5% applied in marketAgent
  const expiresAt = offer.timestamp + (5 * 60 * 1000); // 5 minute expiry

  // Calculate USDC amount and HBAR amount
  // If selling USDC for HBAR: usdcAmount = amount, hbarAmount = amount / price
  // If selling HBAR for USDC: hbarAmount = amount, usdcAmount = amount * price
  let usdcAmount = 0;
  let hbarAmount = 0;
  if (offer.token === "USDC" || offer.token === "0.0.8169931") {
    usdcAmount = offer.amount;
    hbarAmount = offer.amount / offer.price;
  } else if (offer.token === "HBAR") {
    hbarAmount = offer.amount;
    usdcAmount = offer.amount * offer.price;
  }

  return res.json({
    requestId,
    offeredPrice: offer.price,
    usdcAmount,
    hbarAmount,
    spread: 0.5,
    expiresAt,
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    network: (process.env.HEDERA_NETWORK ?? "testnet").toLowerCase(),
    topic: topicId || process.env.HEDERA_TOPIC_ID || "",
  });
});

app.get("/debug/offers", (_req, res) => {
  const offerList = [...offers.values()].map((offer) => ({
    wallet: offer.wallet,
    token: offer.token,
    amount: offer.amount,
    price: offer.price,
    buyToken: offer.buyToken ?? null,
    timestamp: offer.timestamp,
    requestId: offer.requestId,
    notes: offer.notes ?? null,
  }));

  res.json({
    count: offerList.length,
    keys: [...offers.keys()],
    offers: offerList,
  });
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
  const configuredMarketAgent = configuredMarketAgentAddress();
  if (configuredMarketAgent) {
    activeMarketAgents.add(configuredMarketAgent);
  }

  const configuredTopic = (process.env.HEDERA_TOPIC_ID ?? "").trim();
  if (configuredTopic) {
    topicId = configuredTopic;
    try {
      await waitForTopicAvailability(topicId, { attempts: 5, baseDelayMs: 250 });
      // eslint-disable-next-line no-console
      console.log(`Using configured HCS topic ${topicId}`);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(
        `Configured topic ${topicId} is not available (${details}). Creating a new topic.`
      );
      topicId = await createTopic("AgentFi OTC Negotiation Topic");
    }
  } else {
    topicId = await createTopic("AgentFi OTC Negotiation Topic");
  }

  try {
    await waitForTopicAvailability(topicId, { attempts: 6, baseDelayMs: 250 });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(
      `Topic ${topicId} may still be propagating (${details}). Continuing with bridge subscription.`
    );
  }

  setFlowState("Discovering", `topic=${topicId}`);

  // eslint-disable-next-line no-console
  console.log(`✅ Connected to Hedera ${process.env.HEDERA_NETWORK ?? "testnet"}`);

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

  // eslint-disable-next-line no-console
  console.log(`✅ HCS topic subscribed: ${topicId}`);

  // Start autonomous OpenClaw heartbeat skill when OPENCLAW_AUTONOMOUS=true.
  await startOpenClawAutonomy(topicId);

  const port = Number(process.env.PORT || 3001);
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/observer" });

  const handlePortInUse = async (): Promise<void> => {
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) {
        // eslint-disable-next-line no-console
        console.log(
          `Port ${port} is already serving a backend instance. Reusing existing process.`
        );
        process.exit(0);
        return;
      }
    } catch {
      // No healthy backend found; fall through to hard error.
    }

    // eslint-disable-next-line no-console
    console.error(
      `Port ${port} is already in use. Stop the existing process or change PORT in backend/.env.`
    );
    process.exit(1);
  };

  httpServer.on("error", (error) => {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EADDRINUSE") {
      void handlePortInUse();
      return;
    }

    // eslint-disable-next-line no-console
    console.error("HTTP server error:", err);
    process.exit(1);
  });

  wss.on("error", (error) => {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EADDRINUSE") {
      void handlePortInUse();
      return;
    }

    // eslint-disable-next-line no-console
    console.error("WebSocket server error:", err);
    process.exit(1);
  });

  wss.on("connection", (socket) => {
    wsClients.add(socket);
    socket.send(JSON.stringify(observerSnapshot()));

    socket.on("close", () => {
      wsClients.delete(socket);
    });
  });

  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`✅ Server running on port ${port}`);
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
