import type { Metadata } from "next";
import { ConnectWallet } from "@/components/ConnectWallet";
import { WalletProvider } from "@/context/WalletContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentFi - AI-Powered OTC Trading",
  description: "Agent-native OTC trading platform built on Hedera. Let AI agents trade for you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased pt-16">
        <WalletProvider>
          <nav className="fixed top-0 left-0 w-full z-50 border-b-2 border-violet-400 bg-black/95 backdrop-blur-lg shadow-lg shadow-violet-500/50">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
              <a href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 bg-violet-500 flex items-center justify-center rounded border border-violet-300 shadow-lg shadow-violet-500/80">
                  <span className="text-black font-black text-xl">🤖</span>
                </div>
                <span className="font-bold tracking-tighter text-lg text-violet-400 group-hover:text-violet-300 transition-all glow-text">
                  AGENTFI
                </span>
              </a>

              <div className="hidden md:flex items-center gap-6">
                {[
                  { name: 'DASHBOARD', path: '/' },
                  { name: 'CHAT', path: '/chat' },
                  { name: 'TRADE', path: '/trade' },
                  { name: 'OBSERVER', path: '/agent-status' },
                  { name: 'BACKEND TEST', path: '/backend-test' },
                ].map((item) => (
                  <a
                    key={item.path}
                    href={item.path}
                    className="text-sm font-bold tracking-widest transition-all text-violet-300 hover:text-violet-400 hover:shadow-lg hover:shadow-violet-500/50 px-2 py-1"
                  >
                    {item.name}
                  </a>
                ))}
              </div>

              <ConnectWallet />
            </div>
          </nav>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
