"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HashConnect, SessionData } from "hashconnect";

type WalletNetwork = "testnet" | null;

interface WalletContextValue {
  accountId: string | null;
  network: WalletNetwork;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  isConnected: boolean;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function parseAccountId(rawValue: string): string | null {
  const value = rawValue.trim();
  const parts = value.split(":");
  const candidate = parts[parts.length - 1];
  return /^0\.0\.\d+$/.test(candidate) ? candidate : null;
}

function parseSessionNetwork(session: SessionData): WalletNetwork {
  const network = session.network?.toLowerCase() ?? "";
  return network.includes("testnet") ? "testnet" : null;
}

function getDappUrl(): string {
  if (typeof window === "undefined") {
    return "https://localhost";
  }
  return window.location.origin;
}

function getDappIcon(): string {
  return `${getDappUrl()}/favicon.ico`;
}

function getProjectId(): string {
  return process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [network, setNetwork] = useState<WalletNetwork>(null);

  const hashConnectRef = useRef<HashConnect | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  const initializeHashConnect = useCallback(async () => {
    if (hashConnectRef.current) {
      return;
    }

    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    initPromiseRef.current = (async () => {
      try {
        const projectId = getProjectId();

        if (!projectId) {
          console.warn(
            "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID not set. Get a free ID from https://cloud.walletconnect.com"
          );
          return;
        }

        const hashconnectModule = await import("hashconnect");
        const HashConnectClass = hashconnectModule.HashConnect;

        const hashconnect = new HashConnectClass(
          "testnet" as never,
          projectId,
          {
            name: "AgentFi",
            description: "AgentFi OTC trading dashboard",
            icons: [getDappIcon()],
            url: getDappUrl(),
          },
          false
        );

        hashconnect.pairingEvent.on((session) => {
          const pairingNetwork = parseSessionNetwork(session);
          if (pairingNetwork !== "testnet") {
            console.warn("Only HashPack testnet sessions are supported");
            void hashconnect.disconnect();
            setAccountId(null);
            setNetwork(null);
            return;
          }

          const pairedAccount =
            session.accountIds
              .map((raw) => parseAccountId(raw))
              .find((value): value is string => Boolean(value)) ?? null;

          setAccountId(pairedAccount);
          setNetwork("testnet");
        });

        hashconnect.disconnectionEvent.on(() => {
          setAccountId(null);
          setNetwork(null);
        });

        hashconnect.connectionStatusChangeEvent.on((state) => {
          if (String(state) === "Disconnected") {
            setAccountId(null);
            setNetwork(null);
          }
        });

        await hashconnect.init();

        const connected = hashconnect.connectedAccountIds
          .map((id) => parseAccountId(id.toString()))
          .find((value): value is string => Boolean(value));

        if (connected) {
          setAccountId(connected);
          setNetwork("testnet");
        }

        hashConnectRef.current = hashconnect;
      } catch (err) {
        console.warn(
          "HashConnect initialization failed:",
          err instanceof Error ? err.message : "Unknown error"
        );
      }
    })();

    try {
      await initPromiseRef.current;
    } catch (err) {
      console.warn(
        "HashConnect init failed:",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      initPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    void initializeHashConnect();
  }, [initializeHashConnect]);

  const connect = useCallback(async () => {
    if (!getProjectId()) {
      throw new Error(
        "WalletConnect project ID missing. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in frontend/.env.local"
      );
    }

    await initializeHashConnect();

    const hashconnect = hashConnectRef.current;
    if (!hashconnect) {
      throw new Error("HashConnect initialization failed");
    }

    await hashconnect.openPairingModal();
  }, [initializeHashConnect]);

  const disconnect = useCallback(async () => {
    const hashconnect = hashConnectRef.current;
    if (!hashconnect) {
      setAccountId(null);
      setNetwork(null);
      return;
    }

    await hashconnect.disconnect();
    setAccountId(null);
    setNetwork(null);
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      accountId,
      network,
      connect,
      disconnect,
      isConnected: Boolean(accountId && network === "testnet"),
    }),
    [accountId, network, connect, disconnect]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside WalletProvider");
  }
  return context;
}
