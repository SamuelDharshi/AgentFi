import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Activity, ShieldCheck, ExternalLink, Loader2, TrendingUp } from 'lucide-react';

export default function TradePanel() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('requestId');
  const [status, setStatus] = useState<'scanning' | 'offer' | 'executing' | 'success'>('scanning');
  
  useEffect(() => {
    if (requestId) {
      const timer = setTimeout(() => setStatus('offer'), 3000);
      return () => clearTimeout(timer);
    }
  }, [requestId]);

  const handleAccept = () => {
    setStatus('executing');
    setTimeout(() => setStatus('success'), 4000);
  };

  if (!requestId) {
    return (
      <div className="terminal-card text-center py-20">
        <Activity className="mx-auto mb-4 text-white/20" size={48} />
        <h2 className="text-xl font-bold mb-2">NO ACTIVE TRADE REQUEST</h2>
        <p className="text-white/40 text-sm">Initiate a trade via the AI Chat to see offers here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="terminal-card">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-black tracking-tighter italic">TRADE OFFER</h2>
            <p className="text-[10px] font-mono text-white/40">ID: {requestId}</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-cyan-accent/10 border border-cyan-accent/20">
            <div className="w-2 h-2 bg-cyan-accent rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-cyan-accent tracking-widest">LIVE HCS FEED</span>
          </div>
        </div>

        {status === 'scanning' && (
          <div className="flex flex-col items-center py-12 space-y-4">
            <Loader2 className="animate-spin text-cyan-accent" size={32} />
            <p className="text-sm font-mono tracking-[0.3em] text-cyan-accent animate-pulse">
              📡 SCANNING FOR OFFERS
            </p>
          </div>
        )}

        {status === 'offer' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 border border-white/10">
                <p className="text-[10px] text-white/40 mb-1">YOU SEND</p>
                <p className="text-2xl font-bold">1,000.00 <span className="text-sm text-white/40">USDC</span></p>
              </div>
              <div className="p-4 bg-white/5 border border-white/10">
                <p className="text-[10px] text-white/40 mb-1">YOU GET</p>
                <p className="text-2xl font-bold text-emerald-400">12,450.00 <span className="text-sm text-white/40">HBAR</span></p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 border-y border-white/5">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-cyan-accent" />
                <span className="text-xs font-mono">PRICE: 0.08032 USDC/HBAR</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-400">SPREAD: 0.02%</span>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={handleAccept}
                className="flex-1 btn-cyan"
              >
                ACCEPT TRADE
              </button>
              <button className="px-6 border border-red-accent/30 text-red-accent hover:bg-red-accent/10 transition-all">
                REJECT
              </button>
            </div>
          </motion.div>
        )}

        {status === 'executing' && (
          <div className="py-12 space-y-6">
            <div className="relative h-2 bg-white/5 overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 4 }}
                className="absolute inset-0 bg-cyan-accent"
              />
            </div>
            <div className="space-y-2 font-mono text-[10px]">
              <p className="text-cyan-accent">✓ VERIFYING WALLET IDENTITY...</p>
              <p className="text-cyan-accent">✓ ENCRYPTING HCS MESSAGE...</p>
              <p className="text-cyan-accent animate-pulse">→ EXECUTING ATOMIC SETTLEMENT...</p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-8 space-y-4"
          >
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/50">
              <ShieldCheck className="text-emerald-500" size={32} />
            </div>
            <h3 className="text-xl font-bold text-emerald-500 tracking-tight">TRADE SUCCESSFUL</h3>
            <p className="text-xs text-white/40 font-mono">Transaction Hash: 0.0.123456@1710658810.123456789</p>
            <a 
              href="#" 
              className="inline-flex items-center gap-2 text-cyan-accent text-[10px] font-bold tracking-widest hover:underline"
            >
              VIEW ON HASHSCAN <ExternalLink size={12} />
            </a>
          </motion.div>
        )}
      </div>
    </div>
  );
}
