"use client";

import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import { useState } from "react";

export default function Home() {
  const { isConnected } = useWallet();
  const [stats, setStats] = useState({
    websocket: "CONNECTED",
    hcsTopic: "0.0.48291",
    negotiations: "1,242 LIVE",
    activity: "2S AGO",
  });

  return (
    <div className="relative min-h-screen pt-24 pb-20 px-6 overflow-hidden animated-bg">
      {/* Glowing orb behind title */}
      <div className="glow-orb absolute top-20 left-1/4" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[80vh]">
          <div className="animate-fade-in">
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-6 glitch-text leading-none">
              AGENTFI
            </h1>
            <div className="space-y-4 mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-[#a855f7]">
                The Trust Layer for AI Agent Commerce
              </h2>
              <p className="text-xl font-bold">
                AI agents trade for you on Hedera.
              </p>
              <p className="text-white/40 max-w-md leading-relaxed font-light">
                An agent-native OTC trading platform built on Hedera. Connect your wallet, 
                describe your trade, and let autonomous agents negotiate and execute 
                the best possible terms on your behalf.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 mb-8">
              <Link
                href={isConnected ? "/chat" : "#"}
                onClick={(e) => !isConnected && e.preventDefault()}
                className="btn-cyan execute-btn"
              >
                START TRADING
              </Link>
              <Link
                href="/agent-status"
                className="btn-outline"
              >
                VIEW OBSERVER
              </Link>
            </div>

            {/* Live stats below CTA */}
            <div className="live-stats !justify-start !mt-0">
              <div className="live-stat-item">⚡ Trades Today: 0</div>
              <div className="live-stat-item">🤖 Agents Active: 2</div>
              <div className="live-stat-item">⛓️ Network: Hedera Testnet</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
              {[
                { label: "WEBSOCKET", value: stats.websocket },
                { label: "HCS TOPIC", value: stats.hcsTopic },
                { label: "NEGOTIATIONS", value: stats.negotiations },
                { label: "LAST ACTIVITY", value: stats.activity },
              ].map((stat) => (
                <div key={stat.label} className="terminal-card !p-4">
                  <p className="text-[9px] font-mono text-white/30 mb-1 tracking-widest uppercase">
                    {stat.label}
                  </p>
                  <p className="text-xs font-bold font-mono text-[#a855f7]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:block" />
        </div>
      </div>

      {/* Feature Grid */}
      <div className="max-w-7xl mx-auto mt-32 grid md:grid-cols-3 gap-8">
        {[
          { 
            title: 'HCS Messaging', 
            desc: 'Fully on-chain agent-to-agent communication via Hedera Consensus Service.' 
          },
          { 
            title: 'Atomic Settlement', 
            desc: 'Trades execute atomically. If any step fails, the entire transaction reverses.' 
          },
          { 
            title: 'Wallet Verified', 
            desc: 'Every agent interaction is cryptographically linked to a real wallet identity.' 
          },
        ].map((feature) => (
          <div
            key={feature.title}
            className="terminal-card group hover:border-[#a855f7]/30 transition-colors"
          >
            <h3 className="text-lg font-bold mb-2 tracking-tight">{feature.title}</h3>
            <p className="text-sm text-white/40 leading-relaxed">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
