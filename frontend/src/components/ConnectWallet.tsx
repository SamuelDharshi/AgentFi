"use client";

import { useWallet } from "@/context/WalletContext";

export default function ConnectWallet() {
  const { accountId, isConnected, isConnecting, connect, disconnect } = useWallet();

  if (isConnecting) {
    return (
      <button disabled className="connect-btn connecting">
        ⏳ Opening wallet prompt...
      </button>
    );
  }

  if (isConnected && accountId) {
    return (
      <button onClick={disconnect} className="connect-btn connected">
        🟢 {accountId.slice(0, 8)}...
      </button>
    );
  }

  return (
    <button onClick={connect} className="connect-btn">
      🔌 CONNECT WALLET
    </button>
  );
}
