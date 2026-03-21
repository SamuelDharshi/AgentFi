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
  success?: boolean;
  transactionId?: string;
  txHash?: string;
  usdcSent?: number;
  hbarReceived?: number;
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

export interface HealthResponse {
  status: string;
  network: string;
  topic: string;
}

export interface DebugOfferRecord {
  wallet: string;
  token: string;
  amount: number;
  price: number;
  buyToken: string | null;
  timestamp: number;
  requestId: string;
  notes: string | null;
}

export interface DebugOffersResponse {
  count: number;
  keys: string[];
  offers: DebugOfferRecord[];
}

export interface LiveOffersResponse {
  count: number;
  newest: DebugOfferRecord | null;
  offers: DebugOfferRecord[];
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
  const response = await api.get<AgentStatusResponse>("/agent-status");
  return response.data;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await api.get<HealthResponse>("/health");
  return response.data;
}

export async function getDebugOffers(): Promise<DebugOffersResponse> {
  const response = await api.get<DebugOffersResponse>("/debug/offers");
  return response.data;
}

export async function getLiveOffers(params: {
  token?: string;
  buyToken?: string;
  excludeRequestId?: string;
} = {}): Promise<LiveOffersResponse> {
  const response = await api.get<LiveOffersResponse>("/trade/offers", {
    params,
  });
  return response.data;
}

export async function getNegotiationLog(): Promise<TradeMessage[]> {
  const response = await api.get<TradeMessage[]>("/negotiation-log");
  return response.data;
}
