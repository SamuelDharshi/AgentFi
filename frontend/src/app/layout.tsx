import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentFi OTC Trading System",
  description: "AI agent-to-agent OTC crypto trading prototype on Hedera",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${plexMono.variable} antialiased`}>
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg-soft)]/80 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
            <a href="/" className="text-lg font-semibold text-[var(--ink)]">
              AgentFi
            </a>
            <div className="flex gap-3 text-sm">
              <a href="/chat" className="rounded-md px-2 py-1 text-[var(--ink)] hover:bg-white/60">
                chat
              </a>
              <a href="/trade" className="rounded-md px-2 py-1 text-[var(--ink)] hover:bg-white/60">
                trade
              </a>
              <a href="/agent-status" className="rounded-md px-2 py-1 text-[var(--ink)] hover:bg-white/60">
                agent-status
              </a>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
