import type { TradeExecutionResponse, TradePayload } from "@/lib/api";

export interface StoredTradeEntry {
  date: string;
  requestId: string;
  usdcSent: number;
  hbarReceived: number;
  txHash: string;
  soldAmount?: number;
  soldToken?: string;
  receivedAmount?: number;
  receivedToken?: string;
}

const STORAGE_KEY = "agentfi_trades";
const STORAGE_LIMIT = 50;

function safeParseTradeHistory(rawValue: string | null): StoredTradeEntry[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is StoredTradeEntry => {
      return Boolean(
        item &&
          typeof item === "object" &&
          typeof (item as StoredTradeEntry).date === "string" &&
          typeof (item as StoredTradeEntry).txHash === "string"
      );
    });
  } catch {
    return [];
  }
}

export function readTradeHistory(): StoredTradeEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  return safeParseTradeHistory(window.localStorage.getItem(STORAGE_KEY));
}

export function writeTradeHistory(entries: StoredTradeEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(entries.slice(0, STORAGE_LIMIT))
  );
}

export function appendTradeHistory(entry: StoredTradeEntry): void {
  const entries = readTradeHistory();
  entries.unshift(entry);
  writeTradeHistory(entries);
}

export function createTradeHistoryEntry(
  offer: TradePayload,
  result: TradeExecutionResponse
): StoredTradeEntry {
  const soldAmount = offer.amount;
  const soldToken = offer.token;
  const receivedToken = offer.buyToken ?? (soldToken === "USDC" ? "HBAR" : "USDC");
  const fallbackReceivedAmount =
    soldToken === "USDC" ? offer.amount / offer.price : offer.amount * offer.price;

  const receivedAmount =
    typeof result.hbarReceived === "number" ? result.hbarReceived : fallbackReceivedAmount;

  const txHash = result.txHash ?? result.transactionId ?? "";

  return {
    date: new Date().toISOString(),
    requestId: offer.requestId,
    usdcSent: soldToken === "USDC" ? soldAmount : result.usdcSent ?? soldAmount,
    hbarReceived: soldToken === "USDC" ? receivedAmount : soldAmount,
    txHash,
    soldAmount,
    soldToken,
    receivedAmount,
    receivedToken,
  };
}

export function formatTradeDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTradeTime(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function shortenHash(hash: string): string {
  if (!hash || hash.length <= 16) {
    return hash;
  }

  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}