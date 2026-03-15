import type { Metadata } from "next";
import { Orbitron, Share_Tech_Mono } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
});

const shareTechMono = Share_Tech_Mono({
  variable: "--font-share-tech-mono",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentFi Observer Dashboard",
  description: "Live observer terminal for autonomous OpenClaw OTC agents on Hedera",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${orbitron.variable} ${shareTechMono.variable} antialiased`}>
        <header className="sticky top-0 z-20 border-b border-cyan-400/20 bg-slate-950/85 backdrop-blur">
          <nav className="mx-auto flex max-w-[1300px] items-center justify-between px-4 py-3 md:px-8">
            <a href="/" className="font-[var(--font-orbitron)] text-lg text-cyan-200">
              AgentFi Observer
            </a>
            <div className="flex gap-3 text-xs uppercase tracking-[0.22em] text-cyan-300/70">
              <a href="/" className="rounded-md border border-cyan-400/20 px-3 py-1 hover:bg-cyan-400/10">
                Dashboard
              </a>
              <a href="/chat" className="rounded-md border border-cyan-400/20 px-3 py-1 hover:bg-cyan-400/10">
                Chat
              </a>
              <a href="/trade" className="rounded-md border border-cyan-400/20 px-3 py-1 hover:bg-cyan-400/10">
                Trade
              </a>
              <a
                href="/agent-status"
                className="rounded-md border border-cyan-400/20 px-3 py-1 hover:bg-cyan-400/10"
              >
                Status
              </a>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
