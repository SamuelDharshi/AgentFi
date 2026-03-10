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
  message: string;
  analysis: {
    slippagePct: number;
    riskScore: number;
    recommendedPrice: number;
    strategy: "OTC" | "DEX";
    reasoning: string;
  };
  tradeRequest: TradePayload;
  negotiation: TradeMessage[];
}

export interface TradeExecutionResponse {
  executed: boolean;
  transactionId?: string;
  settlement?: string;
  message?: string;
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
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000",
});

export async function sendChat(message: string, wallet: string): Promise<ChatResponse> {
  const response = await api.post<ChatResponse>("/chat", { message, wallet });
  return response.data;
}

export async function executeTrade(requestId: string, accepted: boolean): Promise<TradeExecutionResponse> {
  const response = await api.post<TradeExecutionResponse>("/trade", { requestId, accepted });
  return response.data;
}

export async function getAgentStatus(): Promise<AgentStatusResponse> {
  const response = await api.get<AgentStatusResponse>("/agent-status");
  return response.data;
}

export async function getNegotiationLog(): Promise<TradeMessage[]> {
  const response = await api.get<TradeMessage[]>("/negotiation-log");
  return response.data;
}
