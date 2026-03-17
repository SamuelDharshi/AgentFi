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
      <body className="antialiased">
        <WalletProvider>
          <nav className="fixed top-0 left-0 w-full z-50 border-b border-white/5 bg-black/80 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
              <a href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 bg-[#a855f7] flex items-center justify-center">
                  <span className="text-black font-black text-xl">A</span>
                </div>
                <span className="font-bold tracking-tighter text-xl group-hover:text-[#a855f7] transition-colors">
                  AGENTFI <span className="text-xs font-mono opacity-50">OBSERVER</span>
                </span>
              </a>

              <div className="hidden md:flex items-center gap-1">
                {[
                  { name: 'DASHBOARD', path: '/' },
                  { name: 'CHAT', path: '/chat' },
                  { name: 'TRADE', path: '/trade' },
                  { name: 'STATUS', path: '/agent-status' },
                ].map((item) => (
                  <a
                    key={item.path}
                    href={item.path}
                    className="px-4 py-2 text-xs font-bold tracking-widest transition-all hover:text-[#a855f7] text-white/60"
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
