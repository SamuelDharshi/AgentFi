import type { Metadata } from "next";
import { AppNavbar } from "@/components/AppNavbar";
import { ShellFooter } from "@/components/ShellFooter";
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
    <html lang="en" data-scroll-behavior="smooth">
      <body className="antialiased pt-16 animated-bg">
        <div className="top-progress-line" />
        <WalletProvider>
          <AppNavbar />
          <div className="relative min-h-screen">
            {children}
            <ShellFooter />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
