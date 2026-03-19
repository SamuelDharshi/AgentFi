"use client";

import { isAxiosError } from "axios";
import { useEffect, useRef, useState } from "react";
import { AgentObserver, AgentObserverHandle } from "@/components/AgentObserver";
import { NegotiationFeed } from "@/components/NegotiationFeed";
import { ReputationBoard } from "@/components/ReputationBoard";
import { TradePanel } from "@/components/TradePanel";
import { useWallet } from "@/context/WalletContext";
import { TradeMessage, TradePayload, getTradeOffer } from "@/lib/api";

const OFFER_POLL_MS = 3000;

// Market agent addresses: from env + any addresses seen in live HCS feed
const CONFIGURED_MARKET_AGENT = (
  process.env.NEXT_PUBLIC_MARKET_AGENT_EVM_ADDRESS ?? ""
).trim();

export default function TradePage() {
  const { accountId, isConnected } = useWallet();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [offer, setOffer] = useState<TradePayload | null>(null);
  const [offerPolling, setOfferPolling] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  const [marketAgents, setMarketAgents] = useState<string[]>(
    CONFIGURED_MARKET_AGENT ? [CONFIGURED_MARKET_AGENT] : []
  );
  const observerRef = useRef<AgentObserverHandle | null>(null);

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

    const fromStorage = window.localStorage.getItem("agentfi:lastRequestId")?.trim();
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

        // Map backend response to TradePayload format for display
        const offerData: TradePayload = {
          wallet: CONFIGURED_MARKET_AGENT,
          token: "USDC",
          amount: data.usdcAmount,
          price: data.offeredPrice,
          buyToken: "HBAR",
          timestamp: Date.now(),
          requestId: data.requestId,
          notes: `Offer for ${data.usdcAmount} USDC → ${data.hbarAmount} HBAR`,
        };

        setOffer(offerData);
        const msgs = data.negotiation ?? [];
        setMessages(msgs);
        setOfferError(null);

        // Drive observer from negotiation messages
        if (msgs.length > 0) {
          observerRef.current?.onNegotiationMessages(msgs);
        }

        // Collect market agent addresses from offer
        if (CONFIGURED_MARKET_AGENT) {
          setMarketAgents((prev) => Array.from(new Set([...prev, CONFIGURED_MARKET_AGENT])));
        }
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

  if (!requestId) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mt-12 text-center p-8 bg-violet-500/10 border-2 border-violet-500/50 rounded">
          <p className="text-violet-300 text-xl mb-4">📡 No active trade found</p>
          <p className="text-slate-400 text-sm mb-6">Go to chat to start a new trade request</p>
          <a
            href="/chat"
            className="inline-block px-6 py-3 bg-violet-600 text-white rounded border-2 border-violet-400 hover:bg-violet-700 transition font-bold"
          >
            → GO TO CHAT
          </a>
        </div>
      </main>
    );
  }

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
        <p className="mt-3 text-sm text-violet-200/90">Connected wallet: {accountId}</p>
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

      {/* Main grid: trade + observer */}
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
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

        <div className="space-y-5">
          <AgentObserver
            controllerRef={observerRef}
            messages={messages}
            topicId={null}
          />
          <ReputationBoard marketAgents={marketAgents} />
        </div>
      </div>
    </main>
  );
}
