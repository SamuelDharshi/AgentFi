"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  accountId: null,
  isConnected: false,
  isConnecting: false,
  connect: () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("agentfi_wallet");
    if (saved && saved.startsWith('0.0.')) {
      setAccountId(saved);
      setIsConnected(true);
    }
  }, []);

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);

    try {
      const id = prompt(
        "Enter your Hedera Account ID to connect:\nExample: 0.0.8150748"
      );

      if (id && id.trim().startsWith("0.0.")) {
        const normalized = id.trim();
        setAccountId(normalized);
        setIsConnected(true);
        localStorage.setItem("agentfi_wallet", normalized);
      }
    } catch (err) {
      console.error("Wallet connect error:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, isConnected]);

  const disconnect = useCallback(() => {
    setAccountId(null);
    setIsConnected(false);
    setIsConnecting(false);
    localStorage.removeItem("agentfi_wallet");
  }, []);

  return (
    <WalletContext.Provider value={{
      accountId,
      isConnected,
      isConnecting,
      connect,
      disconnect
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
