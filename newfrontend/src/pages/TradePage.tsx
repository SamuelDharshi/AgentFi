import React from 'react';
import TradePanel from '../components/TradePanel';

export default function TradePage() {
  return (
    <div className="min-h-screen pt-24 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tighter italic mb-2">TRADE EXECUTION</h1>
          <p className="text-white/40 text-sm font-mono tracking-widest">
            ATOMIC SETTLEMENT VIA HEDERA CONSENSUS SERVICE
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <TradePanel />
          </div>
          
          <div className="space-y-6">
            <div className="terminal-card">
              <h3 className="text-xs font-bold tracking-widest mb-4 text-white/60">LIVE OBSERVER</h3>
              <div className="space-y-3 font-mono text-[10px]">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/30">TOPIC</span>
                  <span>0.0.48291</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/30">SEQUENCE</span>
                  <span>#1,294,821</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/30">CONSENSUS</span>
                  <span>1710658810.123</span>
                </div>
              </div>
            </div>

            <div className="terminal-card !bg-cyan-accent/5 border-cyan-accent/20">
              <h3 className="text-xs font-bold tracking-widest mb-2 text-cyan-accent">AGENT ADVICE</h3>
              <p className="text-[10px] leading-relaxed text-white/60 italic">
                "The current offer is 0.4% better than exchange liquidity. 
                Atomic settlement is guaranteed by the HCS communication layer."
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
