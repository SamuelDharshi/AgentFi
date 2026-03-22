"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

interface ReputationRow {
  address: string;
  score: bigint;
  tradeCount: bigint;
  lastUpdatedAt: bigint;
}

interface ReputationBoardProps {
  marketAgents: string[];
}

const REGISTRY_ABI = [
  "function getReputation(address agent) view returns (tuple(uint256 score,uint256 tradeCount,uint256 lastUpdatedAt))",
];

function normaliseAddresses(addresses: string[]): string[] {
  return Array.from(
    new Set(
      addresses
        .map((value) => value.trim())
        .filter((value) => ethers.isAddress(value))
        .map((value) => ethers.getAddress(value))
    )
  );
}

function shortenAddresss(addr: string): string {
  if (!addr || addr.length < 6) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function ReputationBoard({ marketAgents }: ReputationBoardProps) {
  const [rows, setRows] = useState<ReputationRow[]>([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rpcUnavailable, setRpcUnavailable] = useState(false);

  const registryAddress = (process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? "").trim();
  const rpcUrl =
    (process.env.NEXT_PUBLIC_HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api").trim();

  const addresses = useMemo(() => normaliseAddresses(marketAgents), [marketAgents]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (rpcUnavailable) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      if (!registryAddress || !ethers.isAddress(registryAddress)) {
        if (!cancelled) {
          setRows([]);
          setMissing(true);
        }
        return;
      }

      if (addresses.length === 0) {
        if (!cancelled) {
          setRows([]);
          setMissing(false);
        }
        return;
      }

      setMissing(false);
      setLoading(true);
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const contract = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);

        const data: ReputationRow[] = await Promise.all(
          addresses.map(async (address) => {
            const rep = await contract.getReputation(address);
            return {
              address,
              score: BigInt(String(rep.score ?? rep[0] ?? 0)),
              tradeCount: BigInt(String(rep.tradeCount ?? rep[1] ?? 0)),
              lastUpdatedAt: BigInt(String(rep.lastUpdatedAt ?? rep[2] ?? 0)),
            };
          })
        );

        if (!cancelled) {
          setRows(data);
          setMissing(false);
        }
      } catch (err) {
        if (!cancelled) {
          setMissing(false);
          setRpcUnavailable(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    if (rpcUnavailable) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(() => {
      void load();
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [addresses, registryAddress, rpcUnavailable, rpcUrl]);

  return (
    <section className="panel-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="panel-title">⭐ Market Agent Reputation</h2>
        <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-mono text-emerald-300">
          🟢 LIVE TESTNET
        </span>
      </div>

      {missing ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-sm text-red-300">
            ❌ Reputation contract not configured
          </p>
          <p className="mt-1 text-xs text-red-200/70">
            Set NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS in .env.local
          </p>
        </div>
      ) : null}

      {rpcUnavailable ? (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-300">⚠️ Reputation RPC currently unavailable</p>
          <p className="mt-1 text-xs text-amber-200/80">
            Check NEXT_PUBLIC_HEDERA_JSON_RPC_URL and make sure CSP allows the RPC host.
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {rows.length === 0 && !missing ? (
          <div className="text-center py-4">
            <p className="text-sm text-slate-400">
              {loading ? "📡 Fetching on-chain scores..." : "Waiting for market agents..."}
            </p>
          </div>
        ) : null}

        {rows.map((row) => (
          <article
            key={row.address}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 transition hover:bg-emerald-500/10"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏆</span>
                <span className="font-mono text-xs text-emerald-400/80">
                  {shortenAddresss(row.address)}
                </span>
              </div>
              <span className="text-xs text-slate-400">
                {row.lastUpdatedAt > BigInt(0)
                  ? `Updated ${new Date(Number(row.lastUpdatedAt) * 1000).toLocaleTimeString()}`
                  : "No updates yet"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border-l border-emerald-500/20 pl-3">
                <p className="text-xs uppercase tracking-wider text-slate-400/70">⭐ Trades Completed</p>
                <p className="mt-1 text-2xl font-mono text-emerald-300">
                  {row.tradeCount.toString()}
                </p>
              </div>
              <div className="border-l border-emerald-500/20 pl-3">
                <p className="text-xs uppercase tracking-wider text-slate-400/70">🏆 Trust Score</p>
                <p className="mt-1 text-2xl font-mono text-emerald-300">
                  {row.score.toString()}
                </p>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-700/50">
              <p className="text-xs text-slate-500 font-mono">
                📍 {shortenAddresss(row.address)} on Hedera Testnet
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
