"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useWallet } from "@/context/WalletContext";

const Hyperspeed = dynamic(() => import("@/components/Hyperspeed/Hyperspeed"), {
  ssr: false,
});

export default function Home() {
  const { isConnected } = useWallet();
  const [stats, setStats] = useState({
    websocket: "CONNECTED",
    hcsTopic: "0.0.48291",
    negotiations: "1,242 LIVE",
    activity: "2S AGO",
  });

  const hyperspeedEffectOptions = useMemo(
    () => ({
      distortion: "turbulentDistortion",
      length: 400,
      roadWidth: 10,
      islandWidth: 2,
      lanesPerRoad: 3,
      fov: 90,
      fovSpeedUp: 150,
      speedUp: 2,
      carLightsFade: 0.4,
      totalSideLightSticks: 20,
      lightPairsPerRoadWay: 40,
      shoulderLinesWidthPercentage: 0.05,
      brokenLinesWidthPercentage: 0.1,
      brokenLinesLengthPercentage: 0.5,
      lightStickWidth: [0.12, 0.5],
      lightStickHeight: [1.3, 1.7],
      movingAwaySpeed: [60, 80],
      movingCloserSpeed: [-120, -160],
      carLightsLength: [12, 80],
      carLightsRadius: [0.05, 0.14],
      carWidthPercentage: [0.3, 0.5],
      carShiftX: [-0.8, 0.8],
      carFloorSeparation: [0, 5],
      colors: {
        roadColor: 0x080808,
        islandColor: 0x0a0a0a,
        background: 0x000000,
        shoulderLines: 0xffffff,
        brokenLines: 0xffffff,
        leftCars: [0xd856bf, 0x6750a2, 0xc247ac],
        rightCars: [0x03b3c3, 0x0e5ea5, 0x324555],
        sticks: 0x03b3c3,
      },
    }),
    []
  );

  return (
    <div className="relative isolate min-h-screen pt-24 pb-20 px-6 overflow-hidden animated-bg">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-60">
        <Hyperspeed effectOptions={hyperspeedEffectOptions} />
      </div>

      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0, 0, 0, 0.45) 0%, rgba(0, 0, 0, 0.2) 40%, rgba(0, 0, 0, 0.78) 100%), radial-gradient(circle at top, rgba(168, 85, 247, 0.18) 0%, rgba(0, 0, 0, 0) 55%)",
        }}
      />

      {/* Glowing orb behind title */}
      <div className="glow-orb absolute top-20 left-1/4 z-0 pointer-events-none" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[80vh]">
          <div className="animate-fade-in">
            <h1
              className="text-6xl md:text-8xl font-black tracking-tighter mb-6 glitch-text leading-none"
              style={{ textShadow: "0 0 24px rgba(168, 85, 247, 0.55)" }}
            >
              AGENTFI
            </h1>
            <div className="space-y-4 mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-[#a855f7]" style={{ textShadow: "0 0 16px rgba(168, 85, 247, 0.45)" }}>
                The Trust Layer for AI Agent Commerce
              </h2>
              <p className="text-xl font-bold">
                AI agents trade for you on Hedera.
              </p>
              <p className="text-white/60 max-w-md leading-relaxed font-light">
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
            <div className="live-stats justify-start! mt-0!">
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
                <div key={stat.label} className="terminal-card p-4!">
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
      <div className="relative z-10 max-w-7xl mx-auto mt-32 grid md:grid-cols-3 gap-8">
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
