"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TradeExecutionResponse, TradePayload, executeTrade, getTradeOffer } from "@/lib/api";
import { appendTradeHistory } from "@/lib/tradeHistory";

interface TradePanelProps {
  requestId: string;
  offer: TradePayload | null;
  offerPolling: boolean;
  offerError: string | null;
  walletAccountId: string | null;
  isWalletConnected: boolean;
  onNegotiationUpdate: (messages: TradeExecutionResponse["negotiation"]) => void;
  onExecutionResult?: (result: TradeExecutionResponse) => void;
}

type PanelStatus =
  | "idle"
  | "accepting"
  | "rejecting"
  | "searching_new_offer"
  | "offer_found"
  | "final_rejected"
  | "executed";

const OFFER_TTL_SECONDS = 300; // 5 minutes

export function TradePanel({
  requestId,
  offer,
  offerPolling,
  offerError,
  walletAccountId,
  isWalletConnected,
  onNegotiationUpdate,
  onExecutionResult,
}: TradePanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [result, setResult] = useState<TradeExecutionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(OFFER_TTL_SECONDS);
  const [isExpired, setIsExpired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectCount, setRejectCount] = useState(0);
  const [displayOffer, setDisplayOffer] = useState<TradePayload | null>(null);

  // Keep displayOffer in sync with the prop, but allow overrides from new offers
  useEffect(() => {
    if (offer) setDisplayOffer(offer);
  }, [offer]);

  // Reset everything when requestId changes
  useEffect(() => {
    setResult(null);
    setError(null);
    setStatus("idle");
    setIsSubmitting(false);
    setCountdown(OFFER_TTL_SECONDS);
    setIsExpired(false);
    setRejectCount(0);
    setDisplayOffer(null);
  }, [requestId]);

  // Countdown timer with expiry handling
  useEffect(() => {
    if (!displayOffer || result || status === "searching_new_offer") {
      setCountdown(OFFER_TTL_SECONDS);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [displayOffer, result, status]);

  const startNewTrade = () => {
    localStorage.removeItem("agentfi:lastRequestId");
    router.push("/chat");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Poll for a new offer after rejection
  const startPollingForNewOffer = useCallback(() => {
    if (!requestId) return;

    let attempts = 0;
    const maxAttempts = 15; // 15 × 2s = 30s max

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) {
        setStatus("final_rejected");
        return;
      }

      try {
        const data = await getTradeOffer(requestId);
        if (data && data.offeredPrice) {
          const newOfferPayload: TradePayload = {
            wallet: walletAccountId ?? "",
            token: "USDC",
            amount: data.usdcAmount,
            price: data.offeredPrice,
            buyToken: "HBAR",
            timestamp: Date.now(),
            requestId: data.requestId,
            notes: `Better offer found! Market price refreshed.`,
          };
          setDisplayOffer(newOfferPayload);
          setCountdown(OFFER_TTL_SECONDS);
          setIsExpired(false);
          setStatus("offer_found");
          return;
        }
      } catch {
        // 404 = offer not ready yet, keep polling
      }

      // Schedule next poll
      setTimeout(poll, 2000);
    };

    setTimeout(poll, 2000);
  }, [requestId, walletAccountId]);

  async function submit(accepted: boolean) {
    if (isSubmitting) return;
    if (!requestId || !displayOffer) return;

    if (accepted && !isWalletConnected) {
      setError("Please connect your wallet to accept trades");
      return;
    }

    setIsSubmitting(true);
    setStatus(accepted ? "accepting" : "rejecting");
    setError(null);

    try {
      const data = await executeTrade(requestId, accepted, walletAccountId);
      onNegotiationUpdate(data.negotiation || []);
      onExecutionResult?.(data);

      if (accepted && data.executed && displayOffer) {
        const txHash = data.txHash ?? data.transactionId ?? "";
        if (txHash) {
          appendTradeHistory({
            requestId,
            token: displayOffer.token,
            amount: displayOffer.amount,
            price: displayOffer.price,
            buyToken: displayOffer.buyToken ?? "HBAR",
            txHash,
            usdcSent:
              data.usdcSent ??
              (displayOffer.token === "USDC"
                ? displayOffer.amount
                : displayOffer.amount * displayOffer.price),
            hbarReceived:
              data.hbarReceived ??
              (displayOffer.token === "USDC"
                ? displayOffer.amount / displayOffer.price
                : displayOffer.amount),
            settlement: data.settlement ?? null,
            status: "executed",
            timestamp: Date.now(),
          });
        }
        setResult(data);
        setStatus("executed");
        return;
      }

      // Handle rejection response
      if (!accepted) {
        if (data.final) {
          // No more offers
          setStatus("final_rejected");
          setResult(data);
        } else {
          // Searching for a better offer
          const newCount = data.rejectCount ?? rejectCount + 1;
          setRejectCount(newCount);
          setStatus("searching_new_offer");
          setResult(null);
          // Poll for new offer
          startPollingForNewOffer();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trade execution failed");
      setStatus("idle");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canAct = Boolean(
    requestId &&
      displayOffer &&
      !offerError &&
      !isExpired &&
      status !== "executed" &&
      status !== "final_rejected" &&
      status !== "searching_new_offer" &&
      status !== "accepting"
  );

  const transactionHash =
    result?.txHash ?? result?.transactionId ?? null;

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

      {!isWalletConnected && status !== "executed" && (
        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-300 text-sm">
          ⚠️ Connect your Hedera account to accept trades
        </div>
      )}

      <div className="mt-6 space-y-4">
        {!requestId ? (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded text-yellow-300 text-sm font-mono">
            📡 SCANNING FOR OFFERS [● ● ●]
            <br />
            <span className="text-xs text-gray-400 mt-1 block">
              Submit a trade from the chat to get started
            </span>
          </div>
        ) : null}

        {offerPolling && !displayOffer ? (
          <div className="text-violet-300 text-sm font-mono">
            📡 Polling HCS for offer...
          </div>
        ) : null}

        {offerError && !displayOffer ? (
          <div className="text-red-400 text-sm font-mono">❌ {offerError}</div>
        ) : null}

        {isExpired && status !== "executed" && status !== "searching_new_offer" && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded text-center">
            <p className="text-red-400 font-bold mb-2">⏰ OFFER EXPIRED</p>
            <p className="text-gray-400 text-sm mb-4">
              This trade offer has expired.
            </p>
            <button onClick={startNewTrade} className="btn-cyan px-6 py-2">
              START NEW TRADE
            </button>
          </div>
        )}

        {/* ── SEARCHING FOR BETTER OFFER ── */}
        {status === "searching_new_offer" && (
          <div className="p-5 bg-violet-500/10 border-2 border-violet-500/40 rounded-lg text-center animate-pulse">
            <p className="text-violet-300 font-bold text-lg mb-2">
              🔄 Searching for better offer...
            </p>
            <p className="text-gray-400 text-sm mb-3">
              MarketAgent is fetching the latest HBAR price and generating a new
              offer.{" "}
              {rejectCount > 0 && (
                <span className="text-violet-400">
                  (Attempt {rejectCount}/3)
                </span>
              )}
            </p>
            <div className="flex justify-center mt-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400" />
            </div>
          </div>
        )}

        {/* ── LIVE OFFER CARD ── */}
        {displayOffer &&
          status !== "executed" &&
          status !== "final_rejected" &&
          status !== "searching_new_offer" && (
            <div className="card-dark bg-black/40 border-violet-400 p-4">
              {status === "offer_found" && (
                <div className="mb-3 px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 rounded text-emerald-300 text-xs font-mono">
                  ✨ New offer found! Better price available.
                </div>
              )}
              <p className="text-violet-300 font-mono text-xs mb-3">
                [ LIVE OFFER ]
              </p>

              {/* Countdown Timer */}
              <div className="mb-4 p-2 bg-slate-900/50 rounded border border-violet-500/20">
                <span className="text-xs text-slate-400 uppercase tracking-wider">
                  Offer Expires In
                </span>
                <div
                  className={`countdown-timer ${countdown < 60 ? "urgent" : ""}`}
                >
                  {formatTime(countdown)}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">YOU SEND</span>
                  <span className="text-white font-bold">
                    {displayOffer.amount} {displayOffer.token}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">YOU GET</span>
                  <span className="text-violet-300 font-bold">
                    {Math.round(displayOffer.amount / displayOffer.price)}{" "}
                    {displayOffer.buyToken ?? "HBAR"}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-violet-500/20">
                  <span className="text-gray-400">PRICE</span>
                  <span className="text-white font-mono">
                    ${displayOffer.price.toFixed(6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">SPREAD</span>
                  <span className="text-violet-300">0.5%</span>
                </div>
                {displayOffer.notes && (
                  <p className="text-xs text-gray-400 pt-2 mt-2 border-t border-violet-500/20">
                    {displayOffer.notes}
                  </p>
                )}
              </div>
            </div>
          )}

        {requestId &&
          !displayOffer &&
          !offerError &&
          !isExpired &&
          status !== "executed" &&
          status !== "searching_new_offer" ? (
          <div className="text-violet-300 text-sm font-mono">
            🔄 Waiting for market offer...
          </div>
        ) : null}

        {/* ── ACTION BUTTONS ── */}
        {canAct && (
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-cyan flex-1 accept-btn"
              type="button"
              onClick={() => void submit(true)}
              disabled={isSubmitting || !isWalletConnected}
            >
              {isSubmitting && status === "accepting"
                ? "⏳ EXECUTING..."
                : "✅ ACCEPT TRADE"}
            </button>
            <button
              className="btn-red-outline flex-1 reject-btn"
              type="button"
              onClick={() => void submit(false)}
              disabled={isSubmitting}
            >
              {isSubmitting && status === "rejecting" ? "..." : "❌ REJECT"}
            </button>
          </div>
        )}

        {/* Loading spinner while accepting */}
        {status === "accepting" && (
          <div className="p-4 bg-violet-500/10 border border-violet-500/30 rounded text-center">
            <p className="text-violet-300 font-bold mb-2">⏳ Executing trade...</p>
            <p className="text-gray-400 text-sm">This may take 30-60 seconds</p>
            <div className="mt-3 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400" />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 text-red-400 text-sm font-mono border border-red-500/50 rounded">
          ❌ {error}
        </div>
      )}

      {/* ── TRADE COMPLETE (FIX 5) ── */}
      {status === "executed" && result?.executed && (
        <div className="mt-6 p-5 border-2 border-emerald-400/50 bg-emerald-400/10 rounded-lg">
          <p className="text-emerald-300 font-bold text-lg mb-4 text-center">
            ✅ TRADE COMPLETE!
          </p>

          {(() => {
            const sentAmount =
              result.usdcSent ??
              (displayOffer?.token === "USDC"
                ? displayOffer?.amount ?? 0
                : (displayOffer?.amount ?? 0) *
                  (displayOffer?.price ?? 0));
            const receivedAmount =
              result.hbarReceived ??
              (displayOffer?.token === "USDC"
                ? (displayOffer?.amount ?? 0) / (displayOffer?.price ?? 1)
                : displayOffer?.amount ?? 0);

            return (
              <div className="space-y-3 text-sm mb-4">
                <div className="flex justify-between items-center py-2 border-b border-emerald-400/20">
                  <span className="text-gray-400">YOU SENT</span>
                  <span className="text-white font-bold text-lg">
                    {sentAmount} {displayOffer?.token}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-emerald-400/20">
                  <span className="text-gray-400">YOU GOT</span>
                  <span className="text-emerald-300 font-bold text-lg">
                    {receivedAmount} {displayOffer?.buyToken ?? "HBAR"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-emerald-400/20">
                  <span className="text-gray-400">TX HASH</span>
                  {hashScanUrl ? (
                    <a
                      href={hashScanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-violet-300 hover:text-violet-200 font-mono text-xs underline"
                    >
                      {txHashShortened}
                    </a>
                  ) : (
                    <span className="text-gray-500 text-xs">N/A</span>
                  )}
                </div>
                {result.settlement && (
                  <div className="rounded-lg border border-emerald-400/20 bg-black/20 p-3 text-xs text-emerald-100/90">
                    <p className="mb-1 uppercase tracking-[0.2em] text-emerald-200/70">
                      Settlement
                    </p>
                    <p className="font-mono leading-relaxed break-all">
                      {result.settlement}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

          {hashScanUrl && (
            <a
              href={hashScanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 mb-3 border-2 border-emerald-400 bg-emerald-500/10 text-emerald-300 font-bold hover:bg-emerald-500/20 transition rounded"
            >
              🔗 VIEW ON HASHSCAN
              <span className="text-xs text-emerald-400/70 truncate max-w-[200px]">
                hashscan.io/testnet/…
              </span>
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

      {/* ── FINAL REJECTED (no more offers) ── */}
      {status === "final_rejected" && (
        <div className="mt-6 p-5 border-2 border-red-400/50 bg-red-400/10 rounded-lg text-center">
          <p className="text-red-400 font-bold text-lg mb-2">
            ❌ No better offers available
          </p>
          <p className="text-gray-300 mb-2">
            MarketAgent could not find a better price after {rejectCount}{" "}
            {rejectCount === 1 ? "attempt" : "attempts"}.
          </p>
          <p className="text-gray-400 text-sm mb-6">No funds were moved.</p>
          <button onClick={startNewTrade} className="btn-cyan w-full py-3">
            🚀 START NEW TRADE
          </button>
        </div>
      )}
    </section>
  );
}
