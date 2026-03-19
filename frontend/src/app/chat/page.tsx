"use client";

import { useRef, useState } from "react";
import { AgentObserver, AgentObserverHandle } from "@/components/AgentObserver";
import { ChatWindow } from "@/components/ChatWindow";
import { useWallet } from "@/context/WalletContext";
import { ChatResponse, TradeMessage } from "@/lib/api";

export default function ChatPage() {
  const { isConnected, accountId } = useWallet();
  const [messages, setMessages] = useState<TradeMessage[]>([]);
  const [requestId, setRequestId] = useState("");
  const observerRef = useRef<AgentObserverHandle | null>(null);
  const [displayMessages, setDisplayMessages] = useState<
    Array<{ role: "user" | "agent" | "system"; text: string }>
  >([]);

  function handleTradeResponse(data: ChatResponse) {
    // Add system message with request ID
    setDisplayMessages((prev) => [
      ...prev,
      { role: "system", text: `✅ Trade Request Created: ${data.requestId}` },
    ]);

    // Reset observers
    observerRef.current?.reset();
  }

  function handleNegotiationUpdate(msgs: ChatResponse["negotiation"]) {
    if (msgs && msgs.length > 0) {
      setMessages(msgs);
      observerRef.current?.onNegotiationMessages(msgs);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0f0a]">
      {/* Wallet Connection Warning */}
      {!isConnected && (
        <div className="bg-red-900/20 border-b border-red-500/30 text-red-300 px-4 py-3 text-sm flex items-center gap-2">
          <span>⚠️</span>
          <span>Connect your HashPack wallet to execute trades</span>
        </div>
      )}

      <div className="flex h-screen flex-col">
        {/* Header */}
        <header className="border-b border-violet-500/20 bg-slate-950/40 backdrop-blur px-6 py-4">
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

        {/* Main Content Grid */}
        <div className="flex-1 grid grid-cols-3 gap-4 overflow-hidden p-4">
          {/* LEFT SIDE: Chat (60%) */}
          <div className="col-span-2 flex flex-col bg-slate-900/30 rounded-lg border border-violet-500/20 overflow-hidden">
            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto space-y-2 p-4 font-Share_Tech_Mono">
              {displayMessages.length === 0 ? (
                <div className="text-center py-8 text-slate-400/60">
                  <p className="text-sm">[ SYSTEM ] Chat ready. Submit your trade intent below.</p>
                </div>
              ) : (
                displayMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`text-sm font-mono transition-colors ${
                      msg.role === "user"
                        ? "text-right text-violet-300"
                        : msg.role === "agent"
                          ? "text-left text-emerald-300"
                          : "text-center text-slate-400"
                    }`}
                  >
                    <span className="text-slate-500">
                      {msg.role === "user"
                        ? "> USER"
                        : msg.role === "agent"
                          ? "🤖 AGENT"
                          : "[ SYSTEM ]"}
                    </span>
                    <div className={`${msg.role === "agent" ? "agent-message" : ""} ${msg.role === "user" ? "text-right" : ""}`}>
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Section */}
            <div className="border-t border-violet-500/20 bg-gradient-to-t from-slate-950 to-slate-900/50 p-4">
              <ChatWindow
                onNegotiationUpdate={handleNegotiationUpdate}
                onRequestCreated={(id) => {
                  setRequestId(id);
                  setDisplayMessages((prev) => [
                    ...prev,
                    {
                      role: "user",
                      text: "Trade request submitted to market agent",
                    },
                  ]);
                }}
                onTradeResponse={(data) => {
                  setDisplayMessages((prev) => [
                    ...prev,
                    {
                      role: "agent",
                      text: `Market-ready: ${data.amount} ${data.sellToken} → ${data.buyToken} @ $${data.currentPrice.toFixed(6)}`,
                    },
                  ]);
                  handleTradeResponse(data);
                }}
              />
            </div>
          </div>

          {/* RIGHT SIDE: Observer (40%) */}
          <div className="col-span-1 bg-slate-900/30 rounded-lg border border-violet-500/20 overflow-y-auto p-4">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📡</span>
              <h2 className="font-orbitron text-sm font-semibold text-slate-200 uppercase tracking-widest">
                Agent Activity
              </h2>
            </div>
            <AgentObserver controllerRef={observerRef} messages={messages} />
          </div>
        </div>
      </div>
    </main>
  );
}
