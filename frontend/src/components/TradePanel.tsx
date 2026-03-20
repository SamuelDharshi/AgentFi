"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TradeExecutionResponse, TradePayload, executeTrade } from "@/lib/api";
import { appendTradeHistory } from "@/lib/tradeHistory";

interface TradePanelProps {
  requestId: string;
  offer: TradePayload | null;
  offerPolling: boolean;
  offerError: string | null;
  walletAccountId: string | null;
  isWalletConnected: boolean;
  onNegotiationUpdate: (messages: TradeExecutionResponse["negotiation"]) => void;
}

const OFFER_TTL_SECONDS = 300; // 5 minutes

export function TradePanel({
  requestId,
  offer,
  offerPolling,
  offerError,
  walletAccountId,
  isWalletConnected,
  onNegotiationUpdate,
}: TradePanelProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<"accept" | "reject" | null>(null);
  const [result, setResult] = useState<TradeExecutionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(OFFER_TTL_SECONDS);
  const [isExpired, setIsExpired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Countdown timer with expiry handling
  useEffect(() => {
    if (!offer || result) {
      setCountdown(OFFER_TTL_SECONDS);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          // Auto-reject on expiry
          handleExpiredOffer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [offer, result]);

  const handleExpiredOffer = async () => {
    if (!requestId || !offer) return;
    
    try {
      await executeTrade(requestId, false, walletAccountId);
    } catch (err) {
      console.error("Auto-reject failed:", err);
    }
  };

  const startNewTrade = () => {
    localStorage.removeItem("agentfi:lastRequestId");
    router.push("/chat");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  async function submit(accepted: boolean) {
    // Prevent double submission
    if (isSubmitting) {
      console.log("Already submitting, skipping");
      return;
    }
    
    if (!requestId || !offer) {
      return;
    }

    if (accepted && !isWalletConnected) {
      setError("Please connect your wallet to accept trades");
      return;
    }

    setIsSubmitting(true);
    setLoadingAction(accepted ? "accept" : "reject");
    setError(null);

    try {
      const data = await executeTrade(requestId, accepted, walletAccountId);
      setResult(data);
      onNegotiationUpdate(data.negotiation || []);

      if (accepted && data.executed && offer) {
        const txHash = data.txHash ?? data.transactionId ?? "";
        if (txHash) {
          appendTradeHistory({
            requestId,
            token: offer.token,
            amount: offer.amount,
            price: offer.price,
            buyToken: offer.buyToken ?? "HBAR",
            txHash,
            usdcSent: data.usdcSent ?? (offer.token === "USDC" ? offer.amount : offer.amount * offer.price),
            hbarReceived: data.hbarReceived ?? (offer.token === "USDC" ? offer.amount / offer.price : offer.amount),
            settlement: data.settlement ?? null,
            status: "executed",
            timestamp: Date.now(),
          });
        }
      }
      
      if (!accepted) {
        // Clear storage and URL on reject
        localStorage.removeItem("agentfi:lastRequestId");
        // Clear URL params
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.delete('requestId');
          window.history.replaceState({}, '', url.toString());
        }
        setResult({
          ...data,
          executed: false,
          message: "Trade declined. No funds moved.",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade execution failed");
    } finally {
      setIsSubmitting(false);
      setLoadingAction(null);
    }
  }

  const canAct = Boolean(requestId && offer && !offerError && !isExpired && !result);

  const transactionHash = result?.txHash ?? result?.transactionId ?? null;

  const txHashShortened = transactionHash
    ? `${transactionHash.slice(0, 10)}...${transactionHash.slice(-6)}`
    : null;

  const hashScanUrl = transactionHash
    ? `https://hashscan.io/testnet/transaction/${transactionHash}`
    : null;

  return (
    <section className="card-dark">
      <h2 className="section-title">💰 Trade Execution</h2>
      <p className="mt-2 text-sm text-gray-300">
        Review the market offer and execute the atomic swap on Hedera EVM.
      </p>

      {!isWalletConnected && !result && (
        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-300 text-sm">
          ⚠️ Connect your HashPack wallet to accept trades
        </div>
      )}

      <div className="mt-6 space-y-4">
        {!requestId ? (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded text-yellow-300 text-sm font-mono">
            📡 SCANNING FOR OFFERS [● ● ●]<br/>
            <span className="text-xs text-gray-400 mt-1 block">Submit a trade from the chat to get started</span>
          </div>
        ) : null}

        {offerPolling && !offer ? (
          <div className="text-violet-300 text-sm font-mono">📡 Polling HCS for offer...</div>
        ) : null}

        {offerError && !offer ? (
          <div className="text-red-400 text-sm font-mono">❌ {offerError}</div>
        ) : null}

        {isExpired && !result && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded text-center">
            <p className="text-red-400 font-bold mb-2">⏰ OFFER EXPIRED</p>
            <p className="text-gray-400 text-sm mb-4">This trade offer has expired.</p>
            <button
              onClick={startNewTrade}
              className="btn-cyan px-6 py-2"
            >
              START NEW TRADE
            </button>
          </div>
        )}

        {offer ? (
          <div className="card-dark bg-black/40 border-violet-400 p-4">
            <p className="text-violet-300 font-mono text-xs mb-3">[ LIVE OFFER ]</p>
            
            {/* Countdown Timer */}
            <div className="mb-4 p-2 bg-slate-900/50 rounded border border-violet-500/20">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Offer Expires In</span>
              <div className={`countdown-timer ${countdown < 60 ? 'urgent' : ''}`}>
                {formatTime(countdown)}
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">YOU SEND</span>
                <span className="text-white font-bold">{offer.amount} {offer.token}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">YOU GET</span>
                <span className="text-violet-300 font-bold">{Math.round(offer.price)} {offer.buyToken ?? "HBAR"}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-violet-500/20">
                <span className="text-gray-400">PRICE</span>
                <span className="text-white font-mono">${offer.price.toFixed(6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">SPREAD</span>
                <span className="text-violet-300">0.5%</span>
              </div>
              {offer.notes && (
                <p className="text-xs text-gray-400 pt-2 mt-2 border-t border-violet-500/20">{offer.notes}</p>
              )}
            </div>
          </div>
        ) : requestId && !offerError && !isExpired && !result ? (
          <div className="text-violet-300 text-sm font-mono">🔄 Waiting for market offer...</div>
        ) : null}

        {canAct && (
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-cyan flex-1 accept-btn"
              type="button"
              onClick={() => void submit(true)}
              disabled={isSubmitting || loadingAction !== null || !isWalletConnected}
            >
              {isSubmitting && loadingAction === "accept" ? "⏳ EXECUTING..." : "✅ ACCEPT TRADE"}
            </button>
            <button
              className="btn-red-outline flex-1 reject-btn"
              type="button"
              onClick={() => void submit(false)}
              disabled={isSubmitting || loadingAction !== null}
            >
              {isSubmitting && loadingAction === "reject" ? "..." : "❌ REJECT"}
            </button>
          </div>
        )}

        {/* Simple Loading Spinner while executing */}
        {loadingAction === "accept" && (
          <div className="p-4 bg-violet-500/10 border border-violet-500/30 rounded text-center">
            <p className="text-violet-300 font-bold mb-2">⏳ Executing trade...</p>
            <p className="text-gray-400 text-sm">This may take 30-60 seconds</p>
            <div className="mt-3 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400"></div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 text-red-400 text-sm font-mono border border-red-500/50 rounded">
          ❌ {error}
        </div>
      )}

      {/* ACCEPT Success Result */}
      {result?.executed && (
        <div className="mt-6 p-5 border-2 border-emerald-400/50 bg-emerald-400/10 rounded-lg">
          <p className="text-emerald-300 font-bold text-lg mb-4 text-center">✅ TRADE COMPLETE</p>

          {(() => {
            const sentAmount = result.usdcSent ?? (offer?.token === "USDC" ? offer?.amount ?? 0 : (offer?.amount ?? 0) * (offer?.price ?? 0));
            const receivedAmount = result.hbarReceived ?? (offer?.token === "USDC" ? (offer?.amount ?? 0) / (offer?.price ?? 1) : offer?.amount ?? 0);

            return (
              <div className="space-y-3 text-sm mb-4">
                <div className="flex justify-between items-center py-2 border-b border-emerald-400/20">
                  <span className="text-gray-400">YOU SENT</span>
                  <span className="text-white font-bold text-lg">
                    {sentAmount} {offer?.token}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-emerald-400/20">
                  <span className="text-gray-400">YOU GOT</span>
                  <span className="text-emerald-300 font-bold text-lg">
                    {receivedAmount} {offer?.buyToken ?? "HBAR"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-400">TX HASH</span>
                  <a 
                    href={hashScanUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-300 hover:text-violet-200 font-mono text-xs"
                  >
                    {txHashShortened}
                  </a>
                </div>
              </div>
            );
          })()}
          
          {hashScanUrl && (
            <a
              href={hashScanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cyan-outline block text-center py-3 mb-3"
            >
              🔍 VIEW ON HASHSCAN →
            </a>
          )}
          
          <button
            onClick={startNewTrade}
            className="btn-cyan w-full py-3 text-center"
          >
            🚀 START NEW TRADE
          </button>
        </div>
      )}

      {/* REJECT Result */}
      {result && !result.executed && (
        <div className="mt-6 p-5 border-2 border-red-400/50 bg-red-400/10 rounded-lg text-center">
          <p className="text-red-400 font-bold text-lg mb-3">❌ TRADE REJECTED</p>
          <p className="text-gray-300 mb-2">The offer has been declined.</p>
          <p className="text-gray-400 text-sm mb-6">No funds were moved.</p>
          
          <button
            onClick={startNewTrade}
            className="btn-cyan w-full py-3"
          >
            🚀 START NEW TRADE
          </button>
        </div>
      )}
    </section>
  );
}
