import crypto from "crypto";
import { submitMessage } from "../hedera/client";
import { TradeMessage, TradePayload } from "../types/messages";

const bus = new EventTarget();
const encryptionKey = process.env.MESSAGE_ENCRYPTION_KEY || "agentfi-local-encryption-key-32bytes";

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
  await submitMessage(topicId, encrypted);

  bus.dispatchEvent(
    new CustomEvent("trade_message", {
      detail: encrypted,
    }),
  );
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
