const crypto = require("crypto");
const path = require("path");
const dotenv = require("dotenv");
const { Client, PrivateKey, TopicMessageSubmitTransaction } = require("@hashgraph/sdk");
const { ethers } = require("ethers");

dotenv.config({ path: path.resolve(__dirname, "../.env"), override: false });
dotenv.config({ path: path.resolve(__dirname, "../../contracts/.env"), override: false });

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

function normaliseHexKey(key) {
  return key.startsWith("0x") ? key : `0x${key}`;
}

function canonical(envelope) {
  const { signature: _omit, ...rest } = envelope;
  return JSON.stringify(rest);
}

function backendBaseUrl() {
  const configured = process.env.BACKEND_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const port = (process.env.PORT || "3001").trim();
  return `http://localhost:${port}`;
}

async function getTopicId() {
  const response = await fetch(`${backendBaseUrl()}/agent-status`, {
    method: "GET",
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`agent-status failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  if (!data.topicId) {
    throw new Error("agent-status returned empty topicId");
  }
  return String(data.topicId);
}

async function main() {
  const topicId = await getTopicId();
  const operatorId = requireEnv("HEDERA_OPERATOR_ID");
  const operatorKey = requireEnv("HEDERA_OPERATOR_KEY");
  const userKey = normaliseHexKey(
    (process.env.USER_EVM_KEY || process.env.USER_KEY || "").trim()
  );
  const userAccountId = requireEnv("USER_ACCOUNT_ID");
  const htsTokenId = requireEnv("HTS_TOKEN_ID");
  const atomicSwapAddress = requireEnv("ATOMIC_SWAP_ADDRESS");

  const wallet = new ethers.Wallet(userKey);
  const requestId = `live-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

  const envelopeUnsigned = {
    capability: "dev.ucp.trading.checkout",
    version: "1.0",
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sender: wallet.address,
    signature: "",
    payload: {
      requestId,
      initiatorAccount: undefined,
      sellToken: htsTokenId,
      sellAmount: "1000000",
      buyToken: "HBAR",
      limitPrice: "8500000",
      slippageBps: 50,
      expiry: Math.floor(Date.now() / 1000) + 300,
      escrowContract: atomicSwapAddress,
    },
  };

  const signature = await wallet.signMessage(canonical(envelopeUnsigned));
  const envelope = { ...envelopeUnsigned, signature };

  const network = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, PrivateKey.fromStringDer(operatorKey));

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(envelope))
    .execute(client);

  await tx.getReceipt(client);
  client.close();

  console.log(
    `TRADE_REQUEST published to HCS topic | topic=${topicId} requestId=${requestId}`
  );
  console.log(`PUBLISHED_REQUEST_ID=${requestId}`);
  console.log(`PUBLISHED_TOPIC_ID=${topicId}`);
  console.log(`PUBLISHED_TX_ID=${tx.transactionId.toString()}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PUBLISH_ERROR=${message}`);
  process.exit(1);
});
