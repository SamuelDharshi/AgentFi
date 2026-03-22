import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://s.tradingview.com https://www.tradingview.com",
              "frame-src 'self' https://s.tradingview.com https://www.tradingview.com",
              `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? ''} wss: ws: https://api.coingecko.com https://testnet.mirrornode.hedera.com https://s3.tradingview.com https://www.tradingview.com`,
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
