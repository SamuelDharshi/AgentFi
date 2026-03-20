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
  txHash?: string;
  settlement?: string;
  message?: string;
  negotiation?: TradeMessage[];
  success?: boolean;
  usdcSent?: number;
  hbarReceived?: number;
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

export interface BackendHealthResponse {
  status: string;
  network: string;
  topic: string;
}

export interface DebugOffersResponse {
  count: number;
  keys: string[];
  offers: Record<string, TradePayload>;
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

  const data = response.data;

  return {
    executed: data.executed ?? data.success ?? false,
    transactionId: data.transactionId ?? data.txHash,
    txHash: data.txHash ?? data.transactionId,
    settlement: data.settlement,
    message: data.message,
    negotiation: data.negotiation,
    success: data.success ?? data.executed ?? false,
    usdcSent: data.usdcSent,
    hbarReceived: data.hbarReceived,
  };
}

export async function getTradeOffer(requestId: string): Promise<TradeOfferResponse> {
  const response = await api.get<TradeOfferResponse>("/trade/offer", {
    params: { requestId },
  });
  return response.data;
}

export async function getHealth(): Promise<BackendHealthResponse> {
  const response = await api.get<BackendHealthResponse>("/health");
  return response.data;
}

export async function getAgentStatus(): Promise<AgentStatusResponse> {
  const response = await api.get<AgentStatusResponse>("/agent-status");
  return response.data;
}

export async function getDebugOffers(): Promise<DebugOffersResponse> {
  const response = await api.get<DebugOffersResponse>("/debug/offers");
  return response.data;
}

export async function getNegotiationLog(): Promise<TradeMessage[]> {
  const response = await api.get<TradeMessage[]>("/negotiation-log");
  return response.data;
}
