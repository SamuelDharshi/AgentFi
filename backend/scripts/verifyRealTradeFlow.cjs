const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const API_BASE = process.env.BACKEND_URL || "http://localhost:3001";
const MIRROR_BASE = "https://testnet.mirrornode.hedera.com/api/v1";
const USER_ACCOUNT_ID = process.env.USER_ACCOUNT_ID;
const HTS_TOKEN_ID = process.env.HTS_TOKEN_ID;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url} :: ${JSON.stringify(body)}`);
  }
  return body;
}

async function getMirrorSnapshot(accountId, tokenId) {
  const account = await getJson(`${MIRROR_BASE}/accounts/${accountId}`);
  const tokenList = await getJson(`${MIRROR_BASE}/accounts/${accountId}/tokens?limit=200`);
  const found = (tokenList.tokens || []).find((t) => t.token_id === tokenId);

  return {
    accountId,
    hbarTinybar: Number(account.balance?.balance || 0),
    tokenBalance: Number(found?.balance || 0),
    tokenAssociated: Boolean(found),
  };
}

function tinybarToHbar(tinybar) {
  return tinybar / 100_000_000;
}

function tokenToUnits(amount, decimals = 6) {
  return amount / Math.pow(10, decimals);
}

async function pollOffer(requestId, attempts = 20, delayMs = 3000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const offer = await getJson(`${API_BASE}/trade/offer?requestId=${encodeURIComponent(requestId)}`);
      return offer;
    } catch (err) {
      if (i === attempts) {
        throw err;
      }
    }
    await sleep(delayMs);
  }
  throw new Error("Offer polling exhausted");
}

async function main() {
  if (!USER_ACCOUNT_ID || !HTS_TOKEN_ID) {
    throw new Error("USER_ACCOUNT_ID and HTS_TOKEN_ID must be set in backend/.env");
  }

  console.log("=== AgentFi Real Trade Flow Verifier ===");
  console.log(`API: ${API_BASE}`);
  console.log(`User account: ${USER_ACCOUNT_ID}`);
  console.log(`Token: ${HTS_TOKEN_ID}`);
  console.log(`MOCK_HEDERA (env): ${process.env.MOCK_HEDERA}`);

  const health = await getJson(`${API_BASE}/health`);
  const status = await getJson(`${API_BASE}/agent-status`);
  console.log("Health:", health);
  console.log("Agent status:", status);

  const before = await getMirrorSnapshot(USER_ACCOUNT_ID, HTS_TOKEN_ID);
  console.log("Before snapshot:", {
    hbar: tinybarToHbar(before.hbarTinybar),
    token: tokenToUnits(before.tokenBalance),
    tokenAssociated: before.tokenAssociated,
  });

  if (!before.tokenAssociated) {
    throw new Error(`Token ${HTS_TOKEN_ID} is not associated to ${USER_ACCOUNT_ID}`);
  }

  console.log("Step 1/10: Sending chat intent...");
  const chat = await getJson(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message: "Sell 10 USDC for HBAR",
      walletAddress: USER_ACCOUNT_ID,
    }),
  });

  const requestId = chat.requestId;
  if (!requestId) {
    throw new Error(`No requestId from /chat: ${JSON.stringify(chat)}`);
  }
  console.log(`Step 2-5/10: Request created ${requestId}`);

  console.log("Step 6/10: Polling offer...");
  const offer = await pollOffer(requestId);
  console.log("Offer:", {
    requestId: offer.requestId,
    offeredPrice: offer.offeredPrice,
    usdcAmount: offer.usdcAmount,
    hbarAmount: offer.hbarAmount,
    spread: offer.spread,
  });

  console.log("Step 7-10/10: Accepting and executing trade...");
  const trade = await getJson(`${API_BASE}/trade`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId,
      accepted: true,
      walletAddress: USER_ACCOUNT_ID,
    }),
  });

  console.log("Trade response:", trade);

  const txHash = trade.txHash || trade.transactionId || "";
  const hashLooksReal = /^0x[a-fA-F0-9]{64}$/.test(txHash);

  await sleep(4000);
  const after = await getMirrorSnapshot(USER_ACCOUNT_ID, HTS_TOKEN_ID);

  const tokenDelta = after.tokenBalance - before.tokenBalance;
  const hbarDeltaTinybar = after.hbarTinybar - before.hbarTinybar;

  console.log("After snapshot:", {
    hbar: tinybarToHbar(after.hbarTinybar),
    token: tokenToUnits(after.tokenBalance),
  });

  console.log("Deltas:", {
    usdcDeltaRaw: tokenDelta,
    usdcDelta: tokenToUnits(tokenDelta),
    hbarDeltaTinybar,
    hbarDelta: tinybarToHbar(hbarDeltaTinybar),
  });

  const realLike =
    String(process.env.MOCK_HEDERA).toLowerCase() === "false" &&
    hashLooksReal &&
    tokenDelta < 0;

  console.log("Verification:");
  console.log(`- txHash: ${txHash || "<missing>"}`);
  console.log(`- hash format real-like: ${hashLooksReal}`);
  console.log(`- MOCK_HEDERA=false: ${String(process.env.MOCK_HEDERA).toLowerCase() === "false"}`);
  console.log(`- USDC decreased: ${tokenDelta < 0}`);
  console.log(`- HBAR changed: ${hbarDeltaTinybar !== 0}`);
  console.log(`- FINAL verdict (real-like): ${realLike}`);

  if (txHash) {
    console.log(`HashScan: https://hashscan.io/testnet/transaction/${txHash}`);
  }
}

main().catch((err) => {
  console.error("Verifier failed:", err.message || err);
  process.exit(1);
});
