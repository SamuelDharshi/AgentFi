export interface TradeHistoryEntry {
  requestId: string;
  token: string;
  amount: number;
  price: number;
  buyToken: string;
  txHash: string;
  usdcSent: number;
  hbarReceived: number;
  settlement: string | null;
  status: "executed" | "rejected";
  timestamp: number;
}

const STORAGE_KEY = "agentfi_trades";

function isTradeHistoryEntry(value: unknown): value is TradeHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TradeHistoryEntry>;
  return (
    typeof candidate.requestId === "string" &&
    typeof candidate.token === "string" &&
    typeof candidate.amount === "number" &&
    typeof candidate.price === "number" &&
    typeof candidate.buyToken === "string" &&
    typeof candidate.txHash === "string" &&
    typeof candidate.usdcSent === "number" &&
    typeof candidate.hbarReceived === "number" &&
    (candidate.status === "executed" || candidate.status === "rejected") &&
    typeof candidate.timestamp === "number"
  );
}

export function loadTradeHistory(): TradeHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isTradeHistoryEntry)
      .sort((left, right) => right.timestamp - left.timestamp);
  } catch {
    return [];
  }
}

export function saveTradeHistory(entries: TradeHistoryEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 50)));
  window.dispatchEvent(new Event("agentfi-trade-history-updated"));
}

export function appendTradeHistory(entry: TradeHistoryEntry): void {
  const next = [
    entry,
    ...loadTradeHistory().filter((existing) => existing.requestId !== entry.requestId),
  ];

  saveTradeHistory(next);
}

export function getTradeHistoryHashScanUrl(txHash: string): string {
  return `https://hashscan.io/testnet/transaction/${txHash}`;
}
