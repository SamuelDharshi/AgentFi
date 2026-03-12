import crypto from "crypto";
import { submitMessage } from "../hedera/client";
import { getHcsClient } from "../hedera/client";
import {
  buildCheckoutProposal,
  publishProposal,
  subscribeProposals,
} from "../hcs/ucpBus";
import { TradeMessage, TradePayload } from "../types/messages";

const bus = new EventTarget();
const encryptionKey = process.env.MESSAGE_ENCRYPTION_KEY || "agentfi-local-encryption-key-32bytes";
const mockHedera = process.env.MOCK_HEDERA === "true";
const evmSigningKey = (process.env.HEDERA_OPERATOR_EVM_KEY ?? "").replace(/^0x/i, "");
const escrowContract = process.env.ATOMIC_SWAP_ADDRESS ?? "";
const htsTokenId = process.env.HTS_TOKEN_ID ?? "";

function keyBuffer(): Buffer {
  return crypto.createHash("sha256").update(encryptionKey).digest();
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(cipherText: string): string {
  const data = Buffer.from(cipherText, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
}

async function publish(topicId: string, message: TradeMessage): Promise<void> {
  const raw = JSON.stringify(message);
  const encrypted = encrypt(raw);

  if (mockHedera) {
    // In mock mode, use in-process delivery only.
    bus.dispatchEvent(new CustomEvent("trade_message", { detail: encrypted }));
    return; // in-process only — no real HCS submission
  }

  // For TRADE_REQUEST, format as a UCP dev.ucp.trading.checkout envelope
  // and submit to HCS with an EIP-191 sender signature.
  if (message.type === "TRADE_REQUEST" && evmSigningKey) {
    const p = message.payload;
    const proposal = buildCheckoutProposal(
      {
        requestId: p.requestId,
        initiatorAccount: /^0\.0\.\d+$/.test(p.wallet) ? p.wallet : undefined,
        sellToken: htsTokenId || p.token,
        // Convert human amount (float) to 6-decimal smallest units
        sellAmountSmallestUnit: BigInt(Math.round(p.amount * 1_000_000)),
        buyToken: p.buyToken ?? "HBAR",
        // Convert price in HBAR to tinybars (× 100_000_000)
        limitPriceSmallestUnit: BigInt(Math.round(p.price * 100_000_000)),
        slippageBps: 50,
        ttlSeconds: 300,
        escrowContract,
      },
      p.wallet
    );
    await publishProposal(getHcsClient(), topicId, proposal, evmSigningKey);
    return;
  }

  // All other message types: preserve existing encrypted HCS transport.
  await submitMessage(topicId, encrypted);

  // Keep local callback flow for non-TRADE_REQUEST messages.
  bus.dispatchEvent(new CustomEvent("trade_message", { detail: encrypted }));
}

export async function sendTradeRequest(topicId: string, payload: TradePayload): Promise<void> {
  await publish(topicId, {
    type: "TRADE_REQUEST",
    payload,
  });
}

export async function sendTradeOffer(topicId: string, payload: TradePayload): Promise<void> {
  await publish(topicId, {
    type: "TRADE_OFFER",
    payload,
  });
}

export async function sendTradeAccept(topicId: string, payload: TradePayload): Promise<void> {
  await publish(topicId, {
    type: "TRADE_ACCEPT",
    payload,
  });
}

export async function sendTradeExecuted(topicId: string, payload: TradePayload): Promise<void> {
  await publish(topicId, {
    type: "TRADE_EXECUTED",
    payload,
  });
}

export function receiveTradeRequest(callback: (message: TradeMessage) => void): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<string>;
    const decrypted = decrypt(custom.detail);
    const message = JSON.parse(decrypted) as TradeMessage;

    // Reject stale messages over 5 minutes old to prevent replay behavior in demo.
    if (Date.now() - message.payload.timestamp > 5 * 60 * 1000) {
      return;
    }

    callback(message);
  };

  bus.addEventListener("trade_message", handler);
  return () => bus.removeEventListener("trade_message", handler);
}

/**
 * Bridges real HCS traffic into the in-process bus.
 *
 * When MOCK_HEDERA=false, opens a live TopicMessageQuery subscription.
 * Each verified UCP checkout message is converted to a TradeMessage and
 * dispatched into the EventTarget so the existing receiveTradeRequest()
 * callback chain works without changes.
 *
 * Call this once at server startup after the topicId is known.
 */
export function startHcsBridge(topicId: string): void {
  if (mockHedera) return; // nothing to bridge in mock mode

  subscribeProposals(
    getHcsClient(),
    topicId,
    (msg) => {
      if (!msg.signatureVerified) {
        console.warn(
          `[hcsBridge] Dropping unverified message from ${msg.envelope.sender}` +
            ` seq=${msg.sequenceNumber}`
        );
        return;
      }

      const p = msg.envelope.payload;
      const tradePayload: TradePayload = {
        // Route settlement to the original Hedera account when provided.
        wallet: p.initiatorAccount ?? msg.envelope.sender,
        token: p.sellToken,
        amount: Number(p.sellAmount) / 1_000_000,
        price: Number(p.limitPrice) / 100_000_000,
        buyToken: p.buyToken,
        timestamp: new Date(msg.envelope.timestamp).getTime(),
        requestId: p.requestId,
        notes: `HCS seq=${msg.sequenceNumber} ts=${msg.consensusTimestamp}`,
      };

      // Wrap in encrypted form so the existing receiveTradeRequest handler works
      const raw = JSON.stringify({ type: "TRADE_REQUEST", payload: tradePayload });
      const encrypted = encrypt(raw);
      bus.dispatchEvent(new CustomEvent("trade_message", { detail: encrypted }));
    },
    (err) => console.error("[hcsBridge] subscription error:", err.message)
  );
}
