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

export function ReputationBoard({ marketAgents }: ReputationBoardProps) {
  const [rows, setRows] = useState<ReputationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const registryAddress = (process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? "").trim();
  const rpcUrl =
    (process.env.NEXT_PUBLIC_HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api").trim();

  const addresses = useMemo(() => normaliseAddresses(marketAgents), [marketAgents]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!registryAddress || !ethers.isAddress(registryAddress)) {
        if (!cancelled) {
          setRows([]);
          setError("Set NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS to query live reputation.");
        }
        return;
      }

      if (addresses.length === 0) {
        if (!cancelled) {
          setRows([]);
          setError("No active market agents discovered yet.");
        }
        return;
      }

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
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to fetch reputation");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    const timer = setInterval(() => {
      void load();
    }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [addresses, registryAddress, rpcUrl]);

  return (
    <section className="panel-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="panel-title">ERC-8004 Market Reputation</h2>
        <span className="panel-chip">live testnet</span>
      </div>

      {error ? <p className="text-sm text-amber-300/90">{error}</p> : null}

      <div className="space-y-2">
        {rows.length === 0 && !error ? (
          <p className="text-sm text-slate-400">{loading ? "Loading on-chain scores..." : "No data"}</p>
        ) : null}

        {rows.map((row) => (
          <article key={row.address} className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
            <p className="font-mono text-xs text-slate-400">{row.address}</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-slate-500">Score</p>
                <p className="text-cyan-100">{row.score.toString()}</p>
              </div>
              <div>
                <p className="text-slate-500">Trades</p>
                <p className="text-cyan-100">{row.tradeCount.toString()}</p>
              </div>
              <div>
                <p className="text-slate-500">Updated</p>
                <p className="text-cyan-100">
                  {row.lastUpdatedAt > BigInt(0)
                    ? new Date(Number(row.lastUpdatedAt) * 1000).toLocaleTimeString()
                    : "never"}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
