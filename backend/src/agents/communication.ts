import crypto from "crypto";
import { submitMessage } from "../hedera/client";
import { getHcsClient } from "../hedera/client";
import {
  buildCheckoutProposal,
  publishProposal,
  subscribeProposals,
} from "../hcs/ucpBus";
import { TradeMessage, TradePayload } from "../types/messages";

export interface HcsBridgeObservation {
  sequenceNumber: string;
  consensusTimestamp: string;
  sender: string;
  requestId: string;
  signatureVerified: boolean;
  dropped: boolean;
  reason?: string;
}

const bus = new EventTarget();

function isMockMode(): boolean {
  return (process.env.MOCK_HEDERA ?? "").toLowerCase() === "true";
}

function assertLiveMode(): void {
  if (isMockMode()) {
    throw new Error(
      "Live communication is required: set MOCK_HEDERA=false"
    );
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

function getEvmSigningKey(): string {
  return requireEnv("HEDERA_OPERATOR_EVM_KEY").replace(/^0x/i, "");
}

function resolveSellTokenId(payloadToken: string): string {
  if (payloadToken.startsWith("0x") || /^0\.0\.\d+$/.test(payloadToken)) {
    return payloadToken;
  }

  const configuredToken = optionalEnv("HTS_TOKEN_ID");
  if (!configuredToken) {
    throw new Error(
      `HTS_TOKEN_ID is required for UCP checkout when payload token is symbolic (${payloadToken})`
    );
  }
  return configuredToken;
}

function keyBuffer(): Buffer {
  const encryptionKey = requireEnv("MESSAGE_ENCRYPTION_KEY");
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

  // In mock mode, skip HCS publishing but dispatch local events
  if (isMockMode()) {
    // eslint-disable-next-line no-console
    console.log(
      `[MOCK HCS] Publishing ${message.type} | topic=${topicId} requestId=${message.payload.requestId}`
    );
    bus.dispatchEvent(new CustomEvent("trade_message", { detail: encrypted }));
    return;
  }

  // For TRADE_REQUEST, format as a UCP dev.ucp.trading.checkout envelope
  // and submit to HCS with an EIP-191 sender signature.
  if (message.type === "TRADE_REQUEST") {
    const evmSigningKey = getEvmSigningKey();
    const escrowContract = requireEnv("ATOMIC_SWAP_ADDRESS");
    const p = message.payload;
    const proposal = buildCheckoutProposal(
      {
        requestId: p.requestId,
        initiatorAccount: /^0\.0\.\d+$/.test(p.wallet) ? p.wallet : undefined,
        sellToken: resolveSellTokenId(p.token),
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
    // eslint-disable-next-line no-console
    console.log(
      `✅ TRADE_REQUEST published to HCS topic | topic=${topicId} requestId=${p.requestId}`
    );
    return;
  }

  // All other message types: preserve existing encrypted HCS transport.
  await submitMessage(topicId, encrypted);

  // Keep local callback flow for non-TRADE_REQUEST messages.
  bus.dispatchEvent(new CustomEvent("trade_message", { detail: encrypted }));
}

export async function sendTradeRequest(topicId: string, payload: TradePayload): Promise<void> {
  console.log('✅ Step 3: TRADE_REQUEST → HCS');
  console.log(`   Topic: ${topicId}`);
  console.log(`   Request ID: ${payload.requestId}`);
  await publish(topicId, {
    type: "TRADE_REQUEST",
    payload,
  });
  console.log('   Published to HCS');
}

export async function sendTradeOffer(topicId: string, payload: TradePayload): Promise<void> {
  console.log('✅ Step 6: TRADE_OFFER → HCS');
  console.log(`   Topic: ${topicId}`);
  console.log(`   Request ID: ${payload.requestId}`);
  console.log(`   Price: ${payload.price}`);
  await publish(topicId, {
    type: "TRADE_OFFER",
    payload,
  });
  console.log('   Offer published to HCS');
}

export async function sendTradeAccept(topicId: string, payload: TradePayload): Promise<void> {
  await publish(topicId, {
    type: "TRADE_ACCEPT",
    payload,
  });
}

export async function sendTradeExecuted(topicId: string, payload: TradePayload): Promise<void> {
  console.log('✅ Step 11: TRADE_EXECUTED → HCS');
  console.log(`   Topic: ${topicId}`);
  console.log(`   Request ID: ${payload.requestId}`);
  console.log(`   Settlement: ${payload.notes?.slice(0, 100)}...`);
  await publish(topicId, {
    type: "TRADE_EXECUTED",
    payload,
  });
  console.log('   Execution published to HCS');
}

export function receiveTradeRequest(
  callback: (message: TradeMessage) => void | Promise<void>
): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<string>;
    const decrypted = decrypt(custom.detail);
    const message = JSON.parse(decrypted) as TradeMessage;

    // eslint-disable-next-line no-console
    console.log(
      `✅ HCS message received and decrypted | type=${message.type} requestId=${message.payload.requestId}`
    );

    // Reject stale messages over 5 minutes old to prevent replay behavior in demo.
    if (Date.now() - message.payload.timestamp > 5 * 60 * 1000) {
      return;
    }

    try {
      const maybePromise = callback(message);
      if (maybePromise && typeof (maybePromise as Promise<void>).catch === "function") {
        void (maybePromise as Promise<void>).catch((error) => {
          const details = error instanceof Error ? error.message : String(error);
          console.error(`[communication] message callback failed: ${details}`);
        });
      }
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      console.error(`[communication] message callback failed: ${details}`);
    }
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
export function startHcsBridge(
  topicId: string,
  onObserved?: (observation: HcsBridgeObservation) => void
): void {
  // In mock mode, skip Hedera subscription
  if (isMockMode()) {
    // eslint-disable-next-line no-console
    console.log(`[MOCK HCS] Bridge started for topic ${topicId} (mocked)`);
    return;
  }

  subscribeProposals(
    getHcsClient(),
    topicId,
    (msg) => {
      const requestId = msg.envelope.payload.requestId;

      if (!msg.signatureVerified) {
        onObserved?.({
          sequenceNumber: msg.sequenceNumber,
          consensusTimestamp: msg.consensusTimestamp,
          sender: msg.envelope.sender,
          requestId,
          signatureVerified: false,
          dropped: true,
          reason: "signature_mismatch",
        });
        console.warn(
          `[hcsBridge] Dropping unverified message from ${msg.envelope.sender}` +
            ` seq=${msg.sequenceNumber}`
        );
        return;
      }

      onObserved?.({
        sequenceNumber: msg.sequenceNumber,
        consensusTimestamp: msg.consensusTimestamp,
        sender: msg.envelope.sender,
        requestId,
        signatureVerified: true,
        dropped: false,
      });

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
