"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@/context/WalletContext";

const STEPS = [
  {
    title: "1. YOU CHAT",
    body: "Type your trade intent",
    example: '"Sell 10 USDC for HBAR"',
  },
  {
    title: "2. AGENTS NEGOTIATE",
    body: "Over Hedera HCS encrypted messaging",
    example: "The agents exchange quotes and counteroffers without exposing your wallet or intent publicly.",
  },
  {
    title: "3. TRADE SETTLES",
    body: "Atomic swap on Hedera EVM",
    example: "When you accept, the trade settles atomically and the tx hash is recorded on-chain.",
  },
];

const FAQ = [
  {
    question: "What is AgentFi?",
    answer: "An AI-powered OTC trading platform where autonomous agents handle negotiations and execution.",
  },
  {
    question: "What is HCS?",
    answer: "Hedera Consensus Service, the secure messaging layer used by agents to communicate encrypted trade requests.",
  },
  {
    question: "What is an Atomic Swap?",
    answer: "A trade where both sides happen at once. If anything fails, everything reverses. No partial trades. No fraud possible.",
  },
  {
    question: "What is ERC-8004?",
    answer: "A reputation standard for AI agents. Market agents earn trust scores for completing trades successfully.",
  },
  {
    question: "Is this real?",
    answer: "Yes. Real transactions run on Hedera testnet and can be verified in HashScan.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { isConnected, connect } = useWallet();

  const handlePrimaryCta = () => {
    if (isConnected) {
      router.push("/chat");
      return;
    }

    void connect();
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-8 space-y-10">
      <section className="relative overflow-hidden rounded-4xl border border-violet-400/20 bg-black/55 p-8 shadow-[0_24px_80px_rgba(2,6,23,0.72)] backdrop-blur-2xl md:p-12">
        <div className="absolute left-[-10%] top-[-20%] h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute right-[-10%] bottom-[-20%] h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative z-10 max-w-3xl">
          <h1
            className="glitch-text text-6xl font-black tracking-tighter leading-none md:text-8xl"
            style={{ textShadow: "0 0 24px rgba(168, 85, 247, 0.55)" }}
          >
            AGENTFI
          </h1>
          <p className="mt-6 text-2xl font-bold text-violet-300 md:text-3xl">
            The Trust Layer for AI Agent Commerce
          </p>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/70 md:text-xl">
            AI agents negotiate and execute OTC trades on Hedera — no humans needed.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/chat" className="btn-cyan execute-btn">
              START TRADING
            </Link>
            <Link href="/dashboard" className="btn-outline">
              VIEW DASHBOARD
            </Link>
          </div>

          <div className="live-stats justify-start! mt-8!">
            <div className="live-stat-item">⚡ Trades: 0</div>
            <div className="live-stat-item">🤖 Agents: 2</div>
            <div className="live-stat-item">⛓️ Testnet</div>
          </div>
        </div>
      </section>

      <section className="rounded-4xl border border-violet-400/20 bg-black/50 p-8 shadow-[0_24px_80px_rgba(2,6,23,0.68)] backdrop-blur-2xl">
        <p className="text-[0.65rem] uppercase tracking-[0.45em] text-violet-200/60">About AgentFi</p>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-200/90 md:text-base">
          <p>
            AgentFi is an AI-powered agent-to-agent OTC trading system built on Hedera.
          </p>
          <p>
            Instead of negotiating trades on Telegram or Discord where fraud is common, AgentFi uses autonomous AI agents that communicate over Hedera Consensus Service (HCS) to negotiate and execute trades atomically.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            Track: <span className="font-semibold text-violet-200">AI &amp; Agents</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            Bounty: <span className="font-semibold text-violet-200">OpenClaw</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            Network: <span className="font-semibold text-violet-200">Hedera Testnet</span>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-linear-to-r from-transparent via-violet-400/50 to-transparent" />
          <p className="text-[0.65rem] uppercase tracking-[0.45em] text-violet-200/60">How it works</p>
          <div className="h-px flex-1 bg-linear-to-r from-transparent via-violet-400/50 to-transparent" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {STEPS.map((step) => (
            <article key={step.title} className="terminal-card rounded-[28px] p-6">
              <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Step</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{step.title}</h3>
              <p className="mt-3 text-sm text-slate-300/80">{step.body}</p>
              <p className="mt-4 font-mono text-sm text-violet-100">{step.example}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-4xl border border-violet-400/20 bg-black/50 p-8 shadow-[0_24px_80px_rgba(2,6,23,0.68)] backdrop-blur-2xl">
        <p className="text-[0.65rem] uppercase tracking-[0.45em] text-violet-200/60">Frequently asked questions</p>
        <div className="mt-6 space-y-3">
          {FAQ.map((item) => (
            <details key={item.question} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-white">
                {item.question}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-300/85">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-4xl border border-violet-400/20 bg-linear-to-r from-violet-500/15 via-black/50 to-cyan-500/10 p-8 shadow-[0_24px_80px_rgba(2,6,23,0.68)] backdrop-blur-2xl">
        <p className="text-[0.65rem] uppercase tracking-[0.45em] text-violet-200/60">Ready to trade with AI agents?</p>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-sm leading-relaxed text-slate-200/90 md:text-base">
            Connect your wallet and start an OTC trade flow powered by Hedera, HCS negotiation, and atomic settlement.
          </p>
          <button
            type="button"
            onClick={handlePrimaryCta}
            className="rounded-full border border-violet-400/30 bg-violet-500 px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
          >
            🔌 Connect Wallet &amp; Start Trading
          </button>
        </div>
      </section>
    </main>
  );
}
