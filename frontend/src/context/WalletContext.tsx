"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode
} from "react";

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  hashconnect: any;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType>({
  accountId: null,
  isConnected: false,
  isConnecting: false,
  hashconnect: null,
  connect: async () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hc, setHc] = useState<any>(null);
  const [pairingData, setPairingData] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem("agentfi_wallet");
    if (saved && saved.startsWith("0.0.")) {
      setAccountId(saved);
      setIsConnected(true);
    }
  }, []);

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);

    try {
      const { HashConnect } = await import("hashconnect");
      const { LedgerId } = await import("@hashgraph/sdk");

      const projectId =
        process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

      const hashconnect = new HashConnect(
        LedgerId.TESTNET,
        projectId,
        {
          name: "AgentFi",
          description: "AI Agent OTC Trading on Hedera",
          icons: [],
          url: window.location.origin,
        },
        false
      );

      await hashconnect.init();
      setHc(hashconnect);

      hashconnect.pairingEvent.once((data: any) => {
        const id = data?.accountIds?.[0];
        if (id) {
          setAccountId(id);
          setIsConnected(true);
          setPairingData(data);
          localStorage.setItem("agentfi_wallet", id);
          localStorage.setItem(
            "agentfi_pairing",
            JSON.stringify(data)
          );
        }
        setIsConnecting(false);
      });

      await hashconnect.openPairingModal();

      setTimeout(() => {
        setIsConnecting(false);
      }, 120000);
    } catch (err: any) {
      console.error("Wallet error:", err);
      setIsConnecting(false);

      const id = prompt(
        "HashPack not detected.\n" +
          "Enter your Hedera Account ID:\n" +
          "e.g. 0.0.8150748"
      );
      if (id && id.startsWith("0.0.")) {
        setAccountId(id.trim());
        setIsConnected(true);
        localStorage.setItem("agentfi_wallet", id.trim());
      }
    }
  }, [isConnecting, isConnected]);

  const disconnect = useCallback(() => {
    try {
      hc?.disconnect();
    } catch {}
    setAccountId(null);
    setIsConnected(false);
    setIsConnecting(false);
    setHc(null);
    setPairingData(null);
    localStorage.removeItem("agentfi_wallet");
    localStorage.removeItem("agentfi_pairing");
  }, [hc]);

  return (
    <WalletContext.Provider
      value={{
        accountId,
        isConnected,
        isConnecting,
        hashconnect: hc,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export const useWallet = () => useContext(WalletContext);
