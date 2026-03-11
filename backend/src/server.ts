import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { onTradeRequest } from "./agents/marketAgent";
import {
  receiveTradeRequest,
  sendTradeAccept,
  sendTradeExecuted,
  sendTradeRequest,
} from "./agents/communication";
import { buildTradeRequest } from "./agents/userAgent";
import { createTopic, isHederaConfigured } from "./hedera/client";
import { executeTrade } from "./trade/executor";
import { AgentStatus, TradeMessage, TradePayload } from "./types/messages";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

let topicId = process.env.HEDERA_TOPIC_ID || "";
let lastMessageAt: number | null = null;
const negotiationLog: TradeMessage[] = [];
const offers = new Map<string, TradePayload>();

receiveTradeRequest(async (message) => {
  negotiationLog.push(message);
  lastMessageAt = Date.now();

  const offer = await onTradeRequest(topicId, message);
  if (offer) {
    offers.set(offer.requestId, offer);
    negotiationLog.push({
      type: "TRADE_OFFER",
      payload: offer,
    });
    lastMessageAt = Date.now();
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

    negotiationLog.push({
      type: "TRADE_EXECUTED",
      payload: {
        ...offer,
        timestamp: Date.now(),
        notes: execution.transactionId,
      },
    });

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

async function bootstrap(): Promise<void> {
  if (!topicId) {
    topicId = await createTopic("AgentFi OTC Negotiation Topic");
  }

  const port = Number(process.env.PORT || 4000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`AgentFi backend running on port ${port}; topic=${topicId}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Backend bootstrap failed", error);
  process.exit(1);
});
