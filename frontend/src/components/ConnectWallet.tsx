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
          className="rounded-md border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-emerald-200 transition hover:bg-emerald-300/20 disabled:opacity-60"
        >
          {busy ? "Connecting..." : "Connect Wallet"}
        </button>
        {error ? <p className="text-xs text-amber-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="rounded-md border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100">
        {shortenAccountId(accountId)}
      </span>
      <button
        type="button"
        onClick={() => {
          void onDisconnect();
        }}
        disabled={busy}
        className="rounded-md border border-rose-300/35 px-3 py-1 text-xs uppercase tracking-[0.16em] text-rose-200 transition hover:bg-rose-400/10 disabled:opacity-60"
      >
        {busy ? "..." : "Disconnect"}
      </button>
    </div>
  );
}
