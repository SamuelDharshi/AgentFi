import axios from "axios";
import { TradeMessage } from "./api";

export type ObserverFlowState =
  | "Discovering"
  | "Negotiating"
  | "Executing"
  | "Settled";

export interface HcsBridgeObservation {
  sequenceNumber: string;
  consensusTimestamp: string;
  sender: string;
  requestId: string;
  signatureVerified: boolean;
  dropped: boolean;
  reason?: string;
}

export interface ObserverSnapshotEvent {
  type: "snapshot";
  at: number;
  flowState: ObserverFlowState;
  topicId: string | null;
  lastMessageAt: number | null;
  negotiationCount: number;
  activeMarketAgents: string[];
  messages: TradeMessage[];
}

export interface ObserverStateEvent {
  type: "state";
  at: number;
  flowState: ObserverFlowState;
  reason?: string;
}

export interface ObserverTradeEvent {
  type: "trade";
  at: number;
  source: "bridge" | "local" | "api";
  message: TradeMessage;
}

export interface ObserverHcsEvent {
  type: "hcs";
  at: number;
  observation: HcsBridgeObservation;
}

export type ObserverEvent =
  | ObserverSnapshotEvent
  | ObserverStateEvent
  | ObserverTradeEvent
  | ObserverHcsEvent;

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function backendHttpUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  return stripTrailingSlash(apiUrl);
}

export function backendWsUrl(): string {
  const http = backendHttpUrl();
  return http.replace("https://", "wss://").replace("http://", "ws://");
}

const observerApi = axios.create({
  baseURL: backendHttpUrl(),
});

export async function getObserverSnapshot(): Promise<ObserverSnapshotEvent> {
  const response = await observerApi.get<ObserverSnapshotEvent>("/observer/snapshot");
  return response.data;
}

export function configuredMarketAgentAddresses(): string[] {
  const single = (process.env.NEXT_PUBLIC_MARKET_AGENT_EVM_ADDRESS ?? "").trim();
  const multiple = (process.env.NEXT_PUBLIC_MARKET_AGENT_EVM_ADDRESSES ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set([single, ...multiple].filter(Boolean)));
}
