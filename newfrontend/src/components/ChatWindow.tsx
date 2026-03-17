import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, Terminal as TerminalIcon, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Message {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
}

export default function ChatWindow() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'system',
      content: '[ SYSTEM ] AGENT INITIALIZED. STANDING BY FOR OTC REQUESTS.',
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate agent logic
    setTimeout(() => {
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: `Analyzing liquidity for "${userMsg.content}"... OTC desk connection established. I've prepared a trade request on Hedera Consensus Service.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMsg]);
      setIsTyping(false);

      // Auto-redirect to trade after a short delay
      setTimeout(() => {
        const requestId = 'live-' + Math.random().toString(36).substring(7);
        navigate(`/trade?requestId=${requestId}`);
      }, 2000);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-[600px] terminal-card">
      <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/5">
        <TerminalIcon size={14} className="text-cyan-accent" />
        <span className="text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase">
          Agent Terminal v1.0.4
        </span>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-white/10"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex flex-col ${
                msg.role === 'user' ? 'items-end' : msg.role === 'system' ? 'items-center' : 'items-start'
              }`}
            >
              <div className={`flex items-center gap-2 mb-1 opacity-40`}>
                {msg.role === 'agent' && <Bot size={12} />}
                {msg.role === 'user' && <User size={12} />}
                <span className="text-[9px] font-mono uppercase tracking-widest">
                  {msg.role === 'system' ? '' : msg.role}
                </span>
              </div>
              <div
                className={`max-w-[80%] p-3 text-sm font-mono leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-cyan-accent/10 text-cyan-accent border-r-2 border-cyan-accent'
                    : msg.role === 'system'
                    ? 'text-white/30 text-[10px] italic'
                    : 'bg-white/5 text-emerald-400 border-l-2 border-emerald-400'
                }`}
              >
                {msg.role === 'user' && '> '}
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isTyping && (
          <div className="flex items-center gap-2 text-emerald-400/50 text-xs font-mono">
            <Loader2 size={12} className="animate-spin" />
            AGENT IS CALCULATING...
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your trade request (e.g. Sell 1000 USDC for HBAR)"
          className="flex-1 bg-white/5 border border-white/10 p-3 text-sm font-mono focus:outline-none focus:border-cyan-accent/50 transition-colors"
        />
        <button
          type="submit"
          className="bg-cyan-accent text-black p-3 hover:scale-105 active:scale-95 transition-transform"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
