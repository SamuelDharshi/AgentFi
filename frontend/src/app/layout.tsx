// Suppress WalletConnect WebSocket errors
if (typeof window !== 'undefined') {
  const originalConsoleWarn = window.console.warn.bind(window.console)
  const originalConsoleError = window.console.error.bind(window.console)

  const shouldSuppressConsoleMessage = (args: unknown[]): boolean =>
    args.some(
      (value) =>
        typeof value === 'string' &&
        (value.includes('Removing unpermitted intrinsics') || value.includes('SES'))
    )

  window.console.warn = (...args: unknown[]) => {
    if (shouldSuppressConsoleMessage(args)) {
      return
    }
    originalConsoleWarn(...args)
  }

  window.console.error = (...args: unknown[]) => {
    if (shouldSuppressConsoleMessage(args)) {
      return
    }
    originalConsoleError(...args)
  }

  const originalError = window.onerror
  window.onerror = (msg, src, line, col, err) => {
    if (
      typeof msg === 'string' && (
        msg.includes('WebSocket') ||
        msg.includes('walletconnect') ||
        msg.includes('WalletConnect') ||
        msg.includes('Unauthorized: invalid key')
      )
    ) {
      console.warn('WalletConnect error suppressed:', msg)
      return true // suppress
    }
    return originalError?.(msg, src, line, col, err) ?? false
  }

  const originalUnhandled = window.onunhandledrejection
  window.onunhandledrejection = function(event) {
    if (
      event?.reason?.message?.includes('WebSocket') ||
      event?.reason?.message?.includes('walletconnect') ||
      event?.reason?.message?.includes('invalid key')
    ) {
      console.warn('WalletConnect rejection suppressed')
      event.preventDefault()
      return
    }
    if (originalUnhandled) {
      return originalUnhandled.call(window, event)
    }
  }
}

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
