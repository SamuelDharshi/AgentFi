"use client";

import { useRef, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { sendChat } from "@/lib/api";

interface AgentMessage {
  id: number;
  agent: "UserAgent" | "MarketAgent" | "System";
  text: string;
  timestamp: string;
}

const AGENT_STEPS = (hbarPrice: number, amount: number, hbarAmount: number) => [
  { agent: "UserAgent" as const,    text: "Analyzing your trade request..." },
  { agent: "UserAgent" as const,    text: `Fetching live HBAR price from CoinGecko...` },
  { agent: "UserAgent" as const,    text: `HBAR price: $${hbarPrice.toFixed(4)}` },
  { agent: "UserAgent" as const,    text: "Publishing encrypted request to Hedera HCS..." },
  { agent: "UserAgent" as const,    text: "Waiting for Market Agent response..." },
  { agent: "MarketAgent" as const,  text: "Received your request ✅" },
  { agent: "MarketAgent" as const,  text: "Calculating best offer..." },
  { agent: "MarketAgent" as const,  text: `Offer ready! ${hbarAmount} HBAR for ${amount} USDC` },
  { agent: "UserAgent" as const,    text: "Offer received! Redirecting to trade page..." },
];

function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

export default function ChatPage() {
  const router = useRouter();
  const { isConnected, accountId } = useWallet();
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);

  const EXAMPLE_PROMPTS = [
    "Sell 10 USDC for HBAR",
    "Sell 25 USDC for HBAR",
    "Sell 50 USDC for HBAR",
  ];

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages]);

  function addMessage(agent: AgentMessage["agent"], text: string) {
    msgIdRef.current += 1;
    const id = msgIdRef.current;
    setAgentMessages((prev) => [
      ...prev,
      { id, agent, text, timestamp: formatTime() },
    ]);
    return id;
  }

  async function appendStepsWithDelay(
    steps: { agent: "UserAgent" | "MarketAgent"; text: string }[]
  ) {
    for (const step of steps) {
      await new Promise<void>((r) => setTimeout(r, 900));
      addMessage(step.agent, step.text);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isProcessing) return;

    if (!isConnected || !accountId) {
      setError("Connect wallet to trade");
      return;
    }

    const confirmed = window.confirm(
      [
        "Create testnet trade request?",
        text,
        "",
        "This will ask MarketAgent for live offers.",
      ].join("\n")
    );

    if (!confirmed) {
      return;
    }

    setIsProcessing(true);
    setError(null);
    setAgentMessages([]);

    // Add user message
    addMessage("System", `> USER: ${text}`);

    try {
      // Show first two steps while API call runs in parallel
      addMessage("UserAgent", "Analyzing your trade request...");
      addMessage("UserAgent", "Fetching live HBAR price from CoinGecko...");

      // Fire API call
      const dataPromise = sendChat(text, accountId);

      // Small delay before showing price
      await new Promise<void>((r) => setTimeout(r, 900));

      const data = await dataPromise;

      const hbarPrice = data.currentPrice > 0 ? data.currentPrice : 0.094;
      const amount = data.amount ?? 10;
      const hbarAmount = Math.round(amount / hbarPrice);

      addMessage("UserAgent", `HBAR price: $${hbarPrice.toFixed(4)}`);

      const remainingSteps = AGENT_STEPS(hbarPrice, amount, hbarAmount).slice(3);
      await appendStepsWithDelay(remainingSteps);

      // Store requestId and navigate
      if (typeof window !== "undefined") {
        window.localStorage.setItem("agentfi:lastRequestId", data.requestId);
      }

      setTimeout(() => {
        router.push(`/trade?requestId=${data.requestId}`);
      }, 800);

      setInputText("");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to send message";
      if (errMsg.includes("Please specify an amount")) {
        setError("Please specify an amount. Example: Sell 100 USDC for HBAR");
      } else if (errMsg.includes("Amount must be greater than 0")) {
        setError("Amount must be greater than 0");
      } else {
        setError(errMsg);
      }
      addMessage("System", `❌ Error: ${errMsg}`);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0f0a]">
      {/* Wallet Connection Warning */}
      {!isConnected && (
        <div className="bg-red-900/20 border-b border-red-500/30 text-red-300 px-4 py-3 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>Connect your Hedera account to execute trades</span>
        </div>
      )}

      <div className="flex h-screen flex-col">
        {/* Header */}
        <header className="border-b border-violet-500/20 bg-slate-950/40 backdrop-blur px-6 py-4 shrink-0">
          <h1 className="font-orbitron text-2xl text-violet-300 flex items-center gap-2">
            <span className="online-indicator" />
            🤖 UserAgent Terminal
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isConnected && accountId
              ? `Connected: ${accountId}`
              : "Wallet not connected"}
          </p>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 font-mono">
          {agentMessages.length === 0 ? (
            <div className="text-center py-12 text-slate-400/60">
              <p className="text-sm mb-2">[ SYSTEM ] Chat ready.</p>
              <p className="text-xs text-slate-500">
                Type a trade below — e.g. <span className="text-violet-400">Sell 10 USDC for HBAR</span>
              </p>
            </div>
          ) : (
            agentMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-2 text-sm animate-fade-in ${
                  msg.agent === "System"
                    ? "text-center justify-center text-slate-400"
                    : msg.agent === "UserAgent"
                    ? "text-left text-emerald-300"
                    : "text-left text-violet-300"
                }`}
                style={{ animation: "fadeSlideIn 0.4s ease forwards" }}
              >
                {msg.agent !== "System" && (
                  <span className="shrink-0 text-slate-500 text-xs pt-0.5 w-24">
                    [{msg.timestamp}]
                  </span>
                )}
                <span>
                  {msg.agent !== "System" && (
                    <span
                      className={`font-bold mr-2 ${
                        msg.agent === "UserAgent"
                          ? "text-emerald-400"
                          : "text-violet-400"
                      }`}
                    >
                      🤖 {msg.agent}:
                    </span>
                  )}
                  {msg.text}
                </span>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Section */}
        <div className="border-t border-violet-500/20 bg-gradient-to-t from-slate-950 to-slate-900/50 p-4 shrink-0">
          {error && (
            <div className="mb-3 text-red-400 text-xs font-mono bg-red-950/30 border border-red-500/30 rounded p-2">
              ⚠️ {error}
            </div>
          )}

          {/* Example prompt chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInputText(prompt)}
                disabled={!isConnected || isProcessing}
                className="btn-cyan-outline text-xs py-1 px-2"
              >
                {prompt}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="e.g. Sell 10 USDC for HBAR"
              disabled={isProcessing || !isConnected}
              className="flex-1 bg-black/50 border-2 border-violet-400/50 text-violet-100 placeholder-violet-600/60 px-3 py-2 rounded font-mono text-sm focus:border-violet-400 focus:outline-none transition"
            />
            <button
              type="submit"
              disabled={isProcessing || !inputText.trim() || !isConnected}
              className="px-5 py-2 border-2 border-violet-400 bg-black text-violet-300 font-bold tracking-[0.1em] hover:bg-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isProcessing ? "⏳ PROCESSING..." : "⚡ EXECUTE"}
            </button>
          </form>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
