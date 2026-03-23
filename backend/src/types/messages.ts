export type TradeMessageType =
  | "TRADE_REQUEST"
  | "TRADE_OFFER"
  | "TRADE_ACCEPT"
  | "TRADE_EXECUTED";

export interface TradePayload {
  wallet: string;
  token: string;
  amount: number;
  price: number;
  buyToken?: string;
  timestamp: number;
  requestId: string;
  notes?: string;
  isNewOffer?: boolean;
}

export interface TradeMessage {
  type: TradeMessageType;
  payload: TradePayload;
}

export interface AgentAnalysis {
  slippagePct: number;
  riskScore: number;
  recommendedPrice: number;
  strategy: "OTC" | "DEX";
  reasoning: string;
}

export interface AgentStatus {
  userAgentOnline: boolean;
  marketAgentOnline: boolean;
  hederaConnected: boolean;
  topicId: string | null;
  lastMessageAt: number | null;
}
