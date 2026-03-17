"use client";

import { isAxiosError } from "axios";
import { useEffect, useState } from "react";
import { NegotiationFeed } from "@/components/NegotiationFeed";
import { TradePanel } from "@/components/TradePanel";
import { useWallet } from "@/context/WalletContext";
import { TradeMessage, TradePayload, getTradeOffer } from "@/lib/api";

const OFFER_POLL_MS = 3000;

export default function TradePage() {
  const { accountId, isConnected } = useWallet();
  const [requestId, setRequestId] = useState("");
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [offer, setOffer] = useState<TradePayload | null>(null);
  const [offerPolling, setOfferPolling] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const fromQuery = new URLSearchParams(window.location.search)
      .get("requestId")
      ?.trim();
    if (fromQuery) {
      setRequestId(fromQuery);
      return;
    }

    const fromStorage = window.localStorage.getItem("agentfi:lastRequestId")?.trim() ?? "";
    if (fromStorage) {
      setRequestId(fromStorage);
    }
  }, []);

  useEffect(() => {
    if (!requestId) {
      setOffer(null);
      setOfferError(null);
      return;
    }

    let active = true;

    const poll = async () => {
      setOfferPolling(true);

      try {
        const data = await getTradeOffer(requestId);
        if (!active) {
          return;
        }

        setOffer(data.offer);
        setMessages(data.negotiation ?? []);
        setOfferError(null);
      } catch (error) {
        if (!active) {
          return;
        }

        if (isAxiosError(error) && error.response?.status === 404) {
          setOffer(null);
          setOfferError(null);
        } else {
          setOfferError(error instanceof Error ? error.message : "Failed to fetch offer");
        }
      } finally {
        if (active) {
          setOfferPolling(false);
        }
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, OFFER_POLL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [requestId]);

  return (
    <main className="mx-auto max-w-325 px-4 py-8 md:px-8">
      <h1 className="font-(--font-orbitron) text-3xl text-slate-100">Execution Console</h1>
      <p className="mt-1 text-sm text-slate-300/80">
        Confirm a live market offer and authorize AtomicSwap settlement on Hedera EVM.
      </p>
      {!isConnected ? (
        <p className="mt-3 text-sm text-amber-300">
          Please connect your wallet to accept trades
        </p>
      ) : (
        <p className="mt-3 text-sm text-cyan-200/90">Connected wallet: {accountId}</p>
      )}

      <div className="panel-card mt-5 p-4">
        <label className="text-sm text-slate-300">Request ID</label>
        <input
          value={requestId}
          onChange={(event) => {
            const next = event.target.value;
            setRequestId(next);
            if (typeof window !== "undefined") {
              window.localStorage.setItem("agentfi:lastRequestId", next);
            }
          }}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-200"
        />
        <p className="mt-2 text-xs text-slate-400">
          Offers are fetched from the backend every {OFFER_POLL_MS / 1000}s.
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <TradePanel
          requestId={requestId}
          offer={offer}
          offerPolling={offerPolling}
          offerError={offerError}
          walletAccountId={accountId}
          isWalletConnected={isConnected}
          onNegotiationUpdate={(items) => setMessages(items || [])}
        />
        <NegotiationFeed messages={messages} />
      </div>
    </main>
  );
}
