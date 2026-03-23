"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
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
  const hcRef = useRef<any>(null);
  const pairingListenerBoundRef = useRef(false);
  const pairedRef = useRef(false);
  const modalAttemptedRef = useRef(false);

  useEffect(() => {
    // Never mark connected from local storage alone.
    setAccountId(null);
    setIsConnected(false);
  }, []);

  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);
    modalAttemptedRef.current = false;

    try {
      let hashconnect = hcRef.current;

      if (!hashconnect) {
        const { HashConnect } = await import("hashconnect");
        const { LedgerId } = await import("@hashgraph/sdk");

        const projectId =
          process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

        hashconnect = new HashConnect(
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
        hcRef.current = hashconnect;
        setHc(hashconnect);
      }

      const existingAccount = hashconnect.connectedAccountIds?.[0]?.toString?.();
      if (existingAccount) {
        setAccountId(existingAccount);
        setIsConnected(true);
        localStorage.setItem("agentfi_wallet", existingAccount);
        setIsConnecting(false);
        return;
      }

      pairedRef.current = false;
      if (!pairingListenerBoundRef.current) {
        hashconnect.pairingEvent.on((data: any) => {
          const id = data?.accountIds?.[0];
          if (id) {
            pairedRef.current = true;
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
        pairingListenerBoundRef.current = true;
      }

      // HashPack extension pairing can happen automatically after init.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1500);
      });

      if (!pairedRef.current) {
        const postInitAccount = hashconnect.connectedAccountIds?.[0]?.toString?.();
        if (postInitAccount) {
          setAccountId(postInitAccount);
          setIsConnected(true);
          localStorage.setItem("agentfi_wallet", postInitAccount);
          setIsConnecting(false);
          return;
        }
      }

      if (!modalAttemptedRef.current) {
        modalAttemptedRef.current = true;
        if (typeof hashconnect.connectToExtension === "function") {
          await hashconnect.connectToExtension();
        } else if (typeof hashconnect.openPairingModal === "function") {
          await hashconnect.openPairingModal();
        }
      }

      setTimeout(() => {
        if (!pairedRef.current) {
          setAccountId(null);
          setIsConnected(false);
        }
        setIsConnecting(false);
      }, 120000);
    } catch (err: any) {
      console.error("Wallet error:", err);
      const message = String(err?.message ?? "").toLowerCase();
      if (message.includes("proposal expired")) {
        try {
          (hcRef.current ?? hc)?.disconnect?.();
        } catch {}
        pairingListenerBoundRef.current = false;
        pairedRef.current = false;
        modalAttemptedRef.current = false;
      }
      setAccountId(null);
      setIsConnected(false);
      setIsConnecting(false);
      const details = err?.message ? `\n\nDetails: ${err.message}` : "";
      window.alert(
        "HashPack extension pairing failed. Open/Unlock HashPack, disable duplicate wallet extensions, then click CONNECT HASHPACK again." + details
      );
    }
  }, [isConnecting, isConnected]);

  const disconnect = useCallback(() => {
    try {
      (hcRef.current ?? hc)?.disconnect();
    } catch {}
    setAccountId(null);
    setIsConnected(false);
    setIsConnecting(false);
    setHc(null);
    hcRef.current = null;
    pairingListenerBoundRef.current = false;
    pairedRef.current = false;
    modalAttemptedRef.current = false;
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
