import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { Wallet, MessageSquare, BarChart3, Activity } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();
  
  const navItems = [
    { name: 'DASHBOARD', path: '/', icon: BarChart3 },
    { name: 'CHAT', path: '/chat', icon: MessageSquare },
    { name: 'TRADE', path: '/trade', icon: Activity },
    { name: 'STATUS', path: '/agent-status', icon: Wallet },
  ];

  return (
    <nav className="fixed top-0 left-0 w-full z-50 border-b border-white/5 bg-bg-dark/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-cyan-accent flex items-center justify-center">
            <span className="text-black font-black text-xl">A</span>
          </div>
          <span className="font-bold tracking-tighter text-xl group-hover:text-cyan-accent transition-colors">
            AGENTFI <span className="text-xs font-mono opacity-50">OBSERVER</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-4 py-2 text-xs font-bold tracking-widest transition-all hover:text-cyan-accent ${
                location.pathname === item.path ? 'text-cyan-accent bg-cyan-accent/5' : 'text-white/60'
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>

        <button className="border border-cyan-accent/30 px-4 py-2 text-[10px] font-bold tracking-[0.2em] hover:bg-cyan-accent hover:text-black transition-all">
          CONNECT WALLET
        </button>
      </div>
    </nav>
  );
}
