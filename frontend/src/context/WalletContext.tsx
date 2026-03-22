"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

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

  const clearWalletState = useCallback(() => {
    setAccountId(null);
    setIsConnected(false);
    setIsConnecting(false);
    localStorage.removeItem("agentfi_wallet");
    localStorage.removeItem("agentfi_hashconnect_pairing");
  }, []);

  const applyConnectedAccount = useCallback((id: string) => {
    const normalized = id.trim();
    if (!normalized.startsWith("0.0.")) {
      return;
    }
    setAccountId(normalized);
    setIsConnected(true);
    localStorage.setItem("agentfi_wallet", normalized);
  }, []);

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
      if (typeof window !== "undefined") {
        // Open HashPack first so users can approve/pair in wallet UI.
        window.open("https://wallet.hashpack.app", "_blank", "noopener,noreferrer");
      }

      const id = prompt(
        "Approve/pair in HashPack, then enter your Hedera Account ID:\nExample: 0.0.8150748"
      );

      if (id && id.trim().startsWith("0.0.")) {
        applyConnectedAccount(id);
      }
    } catch (err) {
      console.error("Wallet connect error:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [applyConnectedAccount, isConnected, isConnecting]);

  const disconnect = useCallback(() => {
    clearWalletState();
  }, [clearWalletState]);

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
