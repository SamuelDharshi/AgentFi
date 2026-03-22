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
    // Never mark connected from local storage alone.
    setAccountId(null);
    setIsConnected(false);
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

      let paired = false;
      hashconnect.pairingEvent.once((data: any) => {
        const id = data?.accountIds?.[0];
        if (id) {
          paired = true;
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
        if (!paired) {
          setAccountId(null);
          setIsConnected(false);
        }
        setIsConnecting(false);
      }, 120000);
    } catch (err: any) {
      console.error("Wallet error:", err);
      setAccountId(null);
      setIsConnected(false);
      setIsConnecting(false);
      window.alert(
        "HashPack connection failed. Open HashPack extension, unlock wallet, then click CONNECT WALLET again."
      );
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
