import React from 'react';
import ChatWindow from '../components/ChatWindow';

export default function ChatPage() {
  return (
    <div className="min-h-screen pt-24 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tighter italic mb-2">AGENT CHAT</h1>
          <p className="text-white/40 text-sm font-mono tracking-widest">
            COMMUNICATE WITH YOUR PERSONAL TRADING AGENT
          </p>
        </div>
        
        <ChatWindow />
        
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="terminal-card !p-4">
            <p className="text-[9px] text-white/30 mb-1">AGENT STATUS</p>
            <p className="text-xs font-bold text-emerald-400">READY TO NEGOTIATE</p>
          </div>
          <div className="terminal-card !p-4">
            <p className="text-[9px] text-white/30 mb-1">CONNECTED DESKS</p>
            <p className="text-xs font-bold">12 ACTIVE</p>
          </div>
          <div className="terminal-card !p-4">
            <p className="text-[9px] text-white/30 mb-1">HCS LATENCY</p>
            <p className="text-xs font-bold">142MS</p>
          </div>
        </div>
      </div>
    </div>
  );
}
