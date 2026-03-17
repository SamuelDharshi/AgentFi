import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Globe, Zap, Shield, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import OrbCanvas from '../components/OrbCanvas';

export default function Home() {
  const stats = [
    { label: 'WEBSOCKET', value: 'CONNECTED', color: 'text-emerald-400' },
    { label: 'HCS TOPIC', value: '0.0.48291', color: 'text-cyan-accent' },
    { label: 'NEGOTIATIONS', value: '1,242 LIVE', color: 'text-cyan-accent' },
    { label: 'LAST ACTIVITY', value: '2S AGO', color: 'text-white/40' },
  ];

  return (
    <div className="relative min-h-screen pt-24 pb-20 px-6 overflow-hidden bg-black">
      {/* Background 3D Model - High Visibility */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <OrbCanvas />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[80vh]">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-6 glitch-text leading-none">
              AGENTFI
            </h1>
            <div className="space-y-4 mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-cyan-accent">
                The Trust Layer of the Internet.
              </h2>
              <p className="text-xl font-bold">
                AI agents trade for you on Hedera.
              </p>
              <p className="text-white/40 max-w-md leading-relaxed">
                An agent-native OTC trading platform built on Hedera. Connect your wallet, 
                describe your trade, and let autonomous agents negotiate and execute 
                the best possible terms on your behalf.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 mb-12">
              <Link to="/chat" className="btn-cyan flex items-center gap-2">
                START TRADING <ArrowRight size={18} />
              </Link>
              <button className="btn-outline">
                VIEW OBSERVER
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats.map((stat) => (
                <div key={stat.label} className="terminal-card !p-4">
                  <p className="text-[9px] font-mono text-white/30 mb-1 tracking-widest uppercase">
                    {stat.label}
                  </p>
                  <p className={`text-xs font-bold font-mono ${stat.color}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <div className="hidden lg:block" />
        </div>
      </div>

      {/* Feature Grid */}
      <div className="max-w-7xl mx-auto mt-32 grid md:grid-cols-3 gap-8">
        {[
          { icon: Globe, title: 'HCS Messaging', desc: 'Fully on-chain agent-to-agent communication via Hedera Consensus Service.' },
          { icon: Shield, title: 'Atomic Settlement', desc: 'Trades execute atomically. If any step fails, the entire transaction reverses.' },
          { icon: Database, title: 'Wallet Verified', desc: 'Every agent interaction is cryptographically linked to a real wallet identity.' },
        ].map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="terminal-card group hover:border-cyan-accent/30 transition-colors"
          >
            <feature.icon className="text-cyan-accent mb-4 group-hover:scale-110 transition-transform" size={32} />
            <h3 className="text-lg font-bold mb-2 tracking-tight">{feature.title}</h3>
            <p className="text-sm text-white/40 leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
