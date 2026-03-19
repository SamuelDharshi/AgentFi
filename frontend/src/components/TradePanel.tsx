"use client";

import { useEffect, useState } from "react";
import { TradeExecutionResponse, TradePayload, executeTrade } from "@/lib/api";

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
  const [loadingAction, setLoadingAction] = useState<"accept" | "reject" | null>(null);
  const [result, setResult] = useState<TradeExecutionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(OFFER_TTL_SECONDS);

  // Countdown timer
  useEffect(() => {
    if (!offer) {
      setCountdown(OFFER_TTL_SECONDS);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [offer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  async function submit(accepted: boolean) {
    if (!requestId || !offer) {
      return;
    }

    if (accepted && !isWalletConnected) {
      setError("Please connect your wallet to accept trades");
      return;
    }

    setLoadingAction(accepted ? "accept" : "reject");
    setError(null);

    try {
      const data = await executeTrade(requestId, accepted, walletAccountId);
      setResult(data);
      onNegotiationUpdate(data.negotiation || []);
      if (!accepted) {
        setResult({
          ...data,
          message: data.message || "Offer rejected",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade execution failed");
    } finally {
      setLoadingAction(null);
    }
  }

  const canAct = Boolean(requestId && offer && !offerError);

  const txHashShortened = result?.transactionId 
    ? `${result.transactionId.slice(0, 6)}...${result.transactionId.slice(-4)}`
    : null;

  const hashScanUrl = result?.transactionId
    ? `https://hashscan.io/testnet/transaction/${result.transactionId}`
    : null;

  return (
    <section className="card-dark">
      <h2 className="section-title">💰 Trade Execution</h2>
      <p className="mt-2 text-sm text-gray-300">
        Review the market offer and execute the atomic swap on Hedera EVM.
      </p>

      {!isWalletConnected && (
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

        {offer ? (
          <div className="card-dark bg-black/40 border-violet-400 p-4">
            <p className="text-violet-300 font-mono text-xs mb-3">[ LIVE OFFER ]</p>
            
            {/* Countdown Timer */}
            <div className="mb-4 p-2 bg-slate-900/50 rounded border border-violet-500/20">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Offer Expires In</span>
              <div className={`countdown-timer ${countdown < 10 ? 'urgent' : ''}`}>
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
                <span className="text-violet-300 font-bold">{Math.round(offer.amount / offer.price)} {offer.buyToken ?? "HBAR"}</span>
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
        ) : requestId && !offerError ? (
          <div className="text-violet-300 text-sm font-mono">🔄 Waiting for market offer...</div>
        ) : null}

        {canAct && (
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-cyan flex-1 accept-btn"
              type="button"
              onClick={() => {
                void submit(true);
              }}
              disabled={loadingAction !== null || !isWalletConnected}
            >
              {loadingAction === "accept" ? "⏳ EXECUTING..." : "✅ ACCEPT TRADE"}
            </button>
            <button
              className="btn-red-outline flex-1 reject-btn"
              type="button"
              onClick={() => {
                void submit(false);
              }}
              disabled={loadingAction !== null}
            >
              {loadingAction === "reject" ? "..." : "❌ REJECT"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 text-red-400 text-sm font-mono border border-red-500/50 rounded">
          ❌ {error}
        </div>
      )}

      {result?.executed && (
        <div className="mt-6 p-4 border-2 border-emerald-400/50 bg-emerald-400/10 rounded">
          <p className="text-emerald-300 font-bold mb-3">✅ TRADE EXECUTED SUCCESS!</p>
          <div className="space-y-2 text-sm font-mono">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Transaction</span>
              <a 
                href={hashScanUrl || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-300 hover:text-violet-200 underline"
              >
                {txHashShortened}
              </a>
            </div>
            <div className="text-xs text-gray-400 mt-2">
              <p>✅ USDC → Market Agent confirmed</p>
              <p>✅ HBAR → Your wallet confirmed</p>
              <p>✅ Reputation updated</p>
            </div>
          </div>
          {hashScanUrl && (
            <a
              href={hashScanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cyan-outline block text-center mt-3 text-xs py-2"
            >
              VIEW ON HASHSCAN →
            </a>
          )}
        </div>
      )}

      {result && !result.executed && result.message === "Offer rejected" && (
        <div className="mt-4 p-3 text-gray-400 text-sm font-mono border border-gray-500/50 rounded">
          ℹ️ Offer rejected
        </div>
      )}
    </section>
  );
}
