"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { ChatResponse, sendChat } from "@/lib/api";

interface ChatWindowProps {
  onNegotiationUpdate: (messages: ChatResponse["negotiation"]) => void;
  onRequestCreated: (requestId: string) => void;
  onTradeResponse?: (response: ChatResponse) => void;
  autoRedirectToTrade?: boolean;
}

const EXAMPLE_PROMPTS = [
  "Sell 100 USDC for HBAR",
  "Sell 500 HBAR for USDC",
  "Sell 2500 USDC for HBAR",
];

export function ChatWindow({
  onNegotiationUpdate,
  onRequestCreated,
  onTradeResponse,
  autoRedirectToTrade = false,
}: ChatWindowProps) {
  const router = useRouter();
  const { accountId, isConnected } = useWallet();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConnected || !accountId) {
      setError("Connect wallet to trade");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await sendChat(message, accountId);
      setResponse(data);
      onRequestCreated(data.requestId);
      onTradeResponse?.(data);
      
      // Store in localStorage for reference
      if (typeof window !== "undefined") {
        window.localStorage.setItem("agentfi:lastRequestId", data.requestId);
        
        // Auto-redirect to trade page
        setTimeout(() => {
          router.push(`/trade?requestId=${data.requestId}`);
        }, 1500);
      }
      
      // Clear message after successful submission
      setMessage("");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to send message";
      // Check if it's an amount-related error from backend
      if (errMsg.includes("Please specify an amount")) {
        setError("Please specify an amount. Example: Sell 100 USDC for HBAR");
      } else if (errMsg.includes("Amount must be greater than 0")) {
        setError("Amount must be greater than 0");
      } else {
        setError(errMsg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card-dark">
      <h2 className="section-title">🤖 UserAgent Terminal</h2>
      <p className="mt-2 text-sm text-gray-300">
        Submit OTC intent to your personal agent and watch market-agent negotiation in real time.
      </p>

      <p className="mt-2 text-xs text-cyan-400 font-mono">
        {isConnected && accountId
          ? `Connected: ${accountId}`
          : "Please connect your wallet first"}
      </p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <textarea
          className="w-full h-32 bg-black/50 border-2 border-cyan-500/50 text-cyan-100 placeholder-cyan-600 p-3 rounded font-mono text-sm focus:border-cyan-400 focus:outline-none transition"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Type your trade e.g. Sell 100 USDC for HBAR"
          disabled={!isConnected || loading}
          required
        />

        {error && (
          <div className="text-red-400 text-xs font-mono">⚠️ {error}</div>
        )}

        {/* Example prompt chips */}
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => setMessage(prompt)}
              disabled={!isConnected || loading}
              className="btn-cyan-outline text-xs py-1 px-2"
            >
              {prompt}
            </button>
          ))}
        </div>

        <button
          className="btn-cyan w-full py-3"
          disabled={loading || !isConnected}
          type="submit"
        >
          {loading ? "⏳ EXECUTING..." : "⚡ EXECUTE"}
        </button>
      </form>

      {response && (
        <div className="mt-6 pt-4 border-t border-cyan-500/30">
          <p className="text-xs text-cyan-300 font-mono mb-2">[ AGENT RESPONSE ]</p>
          <div className="text-sm text-white font-mono space-y-1">
            <p>✅ Trade Request: {response.requestId}</p>
            <p>📊 Amount: {response.amount} {response.sellToken}</p>
            <p>💰 Price: ${response.currentPrice.toFixed(6)}</p>
            <p className="text-cyan-300 mt-2">↳ Redirecting to trade page...</p>
          </div>
        </div>
      )}
    </section>
  );
}
