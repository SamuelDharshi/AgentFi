import type { NextConfig } from "next";

function toOrigin(value: string | undefined): string {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  async headers() {
    const apiOrigin = toOrigin(process.env.NEXT_PUBLIC_API_URL);
    const rpcOrigin = toOrigin(process.env.NEXT_PUBLIC_HEDERA_JSON_RPC_URL);
    const connectSrc = [
      "'self'",
      apiOrigin,
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      "wss:",
      "ws:",
      "https://api.coingecko.com",
      "https://testnet.mirrornode.hedera.com",
      "https://testnet.hashio.io",
      "https://mainnet.hashio.io",
      "https://s3.tradingview.com",
      "https://www.tradingview.com",
      rpcOrigin,
    ]
      .filter(Boolean)
      .join(" ");

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://s.tradingview.com https://www.tradingview.com",
              "frame-src 'self' https://s.tradingview.com https://www.tradingview.com https://verify.walletconnect.org",
              `connect-src ${connectSrc}`,
              "img-src 'self' data: blob: https:",
              "style-src 'self' 'unsafe-inline' https://s3.tradingview.com",
              "font-src 'self' data: https://s3.tradingview.com",
              "worker-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
    ];
  },

  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
