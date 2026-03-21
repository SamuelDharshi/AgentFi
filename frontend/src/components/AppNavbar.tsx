"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getDebugOffers, getHealth, HealthResponse } from "@/lib/api";
import { useWallet } from "@/context/WalletContext";

const NAV_ITEMS = [
  { href: "/home", label: "HOME" },
  { href: "/dashboard", label: "DASHBOARD" },
  { href: "/chat", label: "CHAT" },
  { href: "/trade", label: "TRADE" },
  { href: "/history", label: "HISTORY" },
  { href: "/agent-status", label: "OBSERVER" },
];

function shortenAccountId(accountId: string): string {
  if (accountId.length <= 14) {
    return accountId;
  }

  return `${accountId.slice(0, 8)}…${accountId.slice(-4)}`;
}

export function AppNavbar() {
  const pathname = usePathname();
  const currentPath = pathname ?? "/";
  const wallet = useWallet();
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [offerCount, setOfferCount] = useState(0);
  const [walletOpen, setWalletOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const [healthData, offersData] = await Promise.all([getHealth(), getDebugOffers()]);
        if (!active) {
          return;
        }

        setHealth(healthData);
        setOfferCount(offersData.count);
      } catch {
        if (!active) {
          return;
        }

        setHealth(null);
        setOfferCount(0);
      }
    };

    void loadStatus();
    const interval = window.setInterval(() => {
      void loadStatus();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(event.target as Node)) {
        setWalletOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setWalletOpen(false);
  }, [pathname]);

  const networkLabel = health
    ? `${health.network.toUpperCase()} · ${health.status.toUpperCase()}`
    : "SYNCING";

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-violet-400/20 bg-black/85 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-450 items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/home" className="group flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-violet-400/20 bg-black/60 shadow shadow-violet-500/10">
            <img src="/logo.png" alt="AgentFi logo" className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.45em] text-violet-200/60">AgentFi</p>
          </div>
        </Link>

        <div className="hidden flex-1 items-center justify-center gap-2 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/"
              ? currentPath === "/"
              : currentPath === item.href || currentPath.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-[0.68rem] font-semibold tracking-[0.32em] transition ${
                  active
                    ? "border border-violet-400/30 bg-violet-500/15 text-violet-100 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                    : "text-slate-300/70 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <div ref={walletMenuRef} className="relative">
            {wallet.isConnected ? (
              <button
                type="button"
                onClick={() => setWalletOpen((value) => !value)}
                className="rounded-full border border-violet-400/30 bg-black/50 px-4 py-2 text-sm text-white transition hover:border-violet-300 hover:bg-violet-500/10"
              >
                {shortenAccountId(wallet.accountId ?? "")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void wallet.connect()}
                disabled={wallet.isConnecting}
                className="rounded-full border border-violet-400/40 bg-violet-500 px-4 py-2 text-sm font-semibold text-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {wallet.isConnecting ? "CONNECTING" : "CONNECT WALLET"}
              </button>
            )}

            {walletOpen && wallet.isConnected ? (
              <div className="absolute right-0 mt-3 w-72 rounded-3xl border border-violet-400/20 bg-black/95 p-4 shadow-2xl shadow-violet-500/20">
                <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Wallet</p>
                <p className="mt-2 text-sm font-semibold text-white">Connected session</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-300">{wallet.accountId}</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Link href="/history" className="text-xs font-semibold tracking-[0.2em] text-violet-200 hover:text-white">
                    VIEW HISTORY
                  </Link>
                  <button
                    type="button"
                    onClick={wallet.disconnect}
                    className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
                  >
                    DISCONNECT
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          className="ml-auto inline-flex rounded-full border border-violet-400/20 bg-white/5 px-4 py-2 text-sm text-white md:hidden"
        >
          MENU
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-violet-400/20 bg-black/96 px-4 py-4 md:hidden">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[0.65rem] font-mono uppercase tracking-[0.25em] text-emerald-100">
              {networkLabel}
            </span>
            <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-[0.65rem] font-mono uppercase tracking-[0.25em] text-violet-100">
              {offerCount} open offers
            </span>
          </div>

          <div className="mt-4 grid gap-2">
            {NAV_ITEMS.map((item) => {
              const active = item.href === "/"
                ? currentPath === "/"
                : currentPath === item.href || currentPath.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-2xl border px-4 py-3 text-sm font-semibold tracking-[0.2em] ${
                    active
                      ? "border-violet-400/30 bg-violet-500/15 text-white"
                      : "border-white/10 bg-white/5 text-slate-200"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
            {wallet.isConnected ? (
              <>
                <p className="text-[0.65rem] uppercase tracking-[0.35em] text-violet-200/60">Wallet</p>
                <p className="mt-2 break-all font-mono text-xs text-slate-200">{wallet.accountId}</p>
                <button
                  type="button"
                  onClick={wallet.disconnect}
                  className="mt-4 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200"
                >
                  DISCONNECT
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void wallet.connect()}
                disabled={wallet.isConnecting}
                className="w-full rounded-full border border-violet-400/40 bg-violet-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-70"
              >
                {wallet.isConnecting ? "CONNECTING" : "CONNECT WALLET"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
