"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";

function shortenAccountId(accountId: string): string {
  const parts = accountId.split(".");
  if (parts.length !== 3) {
    return accountId;
  }

  const suffix = parts[2];
  if (suffix.length <= 4) {
    return accountId;
  }

  return `${parts[0]}.${parts[1]}.${suffix.slice(0, 2)}...${suffix.slice(-2)}`;
}

export function ConnectWallet() {
  const { accountId, connect, disconnect, isConnected } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConnect() {
    setBusy(true);
    setError(null);

    try {
      await connect();
    } catch (connectError) {
      const details =
        connectError instanceof Error
          ? connectError.message
          : "Wallet connection failed";
      setError(details);
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    setError(null);

    try {
      await disconnect();
    } catch (disconnectError) {
      const details =
        disconnectError instanceof Error
          ? disconnectError.message
          : "Wallet disconnect failed";
      setError(details);
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected || !accountId) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            void onConnect();
          }}
          disabled={busy}
          className="border-2 border-violet-400 bg-black text-violet-300 px-4 py-2 text-xs font-bold tracking-[0.2em] hover:bg-violet-500/20 hover:shadow-lg hover:shadow-violet-500/50 transition-all disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? "CONNECTING..." : "CONNECT WALLET"}
        </button>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="border-2 border-black bg-white text-black px-4 py-2 text-xs font-mono font-bold rounded">
        🟢 {shortenAccountId(accountId)}
      </span>
      <button
        type="button"
        onClick={() => {
          void onDisconnect();
        }}
        disabled={busy}
        className="border-2 border-violet-400 bg-black text-violet-300 px-4 py-2 text-xs font-bold tracking-[0.2em] hover:bg-violet-500/20 hover:shadow-lg hover:shadow-violet-500/50 transition-all disabled:opacity-40"
      >
        {busy ? "..." : "DISCONNECT"}
      </button>
    </div>
  );
}
