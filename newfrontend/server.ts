import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Mock API routes
  app.get("/api/trade/offer", (req, res) => {
    const requestId = req.query.requestId;
    if (!requestId) return res.status(400).json({ error: "Missing requestId" });
    
    // Simulate finding an offer
    res.json({
      requestId,
      status: 'offer',
      offer: {
        sendAmount: '1,000.00',
        sendToken: 'USDC',
        getAmount: '12,450.00',
        getToken: 'HBAR',
        price: '0.08032',
        spread: '0.02%'
      }
    });
  });

  app.post("/api/trade/execute", express.json(), (req, res) => {
    const { requestId, walletAddress } = req.body;
    res.json({
      success: true,
      txHash: `0.0.123456@${Math.floor(Date.now() / 1000)}.${Math.floor(Math.random() * 1000000000)}`
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
