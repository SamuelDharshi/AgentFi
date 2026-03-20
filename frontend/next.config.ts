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
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://s.tradingview.com",
              "frame-src 'self' https://s.tradingview.com https://www.tradingview.com https://www.coingecko.com",
              "connect-src 'self' ws: wss: https://api.coingecko.com https://testnet.mirrornode.hedera.com",
              "img-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
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
