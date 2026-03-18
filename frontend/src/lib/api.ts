import axios from "axios";

export interface TradePayload {
  wallet: string;
  token: string;
  amount: number;
  price: number;
  buyToken?: string;
  timestamp: number;
  requestId: string;
  notes?: string;
}

export interface TradeMessage {
  type: "TRADE_REQUEST" | "TRADE_OFFER" | "TRADE_ACCEPT" | "TRADE_EXECUTED";
  payload: TradePayload;
}

export interface ChatResponse {
  requestId: string;
  analysis: string;
  amount: number;
  sellToken: string;
  buyToken: string;
  currentPrice: number;
  tradeRequest?: TradePayload;
  negotiation?: TradeMessage[];
}

export interface TradeExecutionResponse {
  executed: boolean;
  transactionId?: string;
  settlement?: string;
  message?: string;
  negotiation?: TradeMessage[];
}

export interface TradeOfferResponse {
  requestId: string;
  offeredPrice: number;
  usdcAmount: number;
  hbarAmount: number;
  spread: number;
  expiresAt: number;
  offer?: TradePayload;
  negotiation?: TradeMessage[];
}

export interface AgentStatusResponse {
  userAgentOnline: boolean;
  marketAgentOnline: boolean;
  hederaConnected: boolean;
  topicId: string | null;
  lastMessageAt: number | null;
  negotiationCount: number;
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001",
});

export async function sendChat(
  message: string,
  walletAddress: string
): Promise<ChatResponse> {
  const response = await api.post<ChatResponse>("/chat", {
    message,
    walletAddress,
    // Preserve existing backend compatibility.
    wallet: walletAddress,
  });
  return response.data;
}

export async function executeTrade(
  requestId: string,
  accepted: boolean,
  walletAddress?: string | null
): Promise<TradeExecutionResponse> {
  const response = await api.post<TradeExecutionResponse>("/trade", {
    requestId,
    accepted,
    walletAddress: walletAddress ?? undefined,
    wallet: walletAddress ?? undefined,
  });
  return response.data;
}

export async function getTradeOffer(requestId: string): Promise<TradeOfferResponse> {
  const response = await api.get<TradeOfferResponse>("/trade/offer", {
    params: { requestId },
  });
  return response.data;
}

export async function getAgentStatus(): Promise<AgentStatusResponse> {
  try {
    const response = await api.get<any>("/health");
    return {
      userAgentOnline: response.data.status === "ok",
      marketAgentOnline: response.data.status === "ok",
      hederaConnected: response.data.network === "testnet",
      topicId: response.data.topic || null,
      lastMessageAt: response.data.lastActivity ? new Date(response.data.lastActivity).getTime() : null,
      negotiationCount: response.data.negotiations || 0,
    };
  } catch (err) {
    console.error("Failed to fetch agent status:", err);
    throw err;
  }
}

export async function getNegotiationLog(): Promise<TradeMessage[]> {
  const response = await api.get<TradeMessage[]>("/negotiation-log");
  return response.data;
}
