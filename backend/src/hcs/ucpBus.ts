/**
 * ucpBus — Universal Commerce Protocol ↔ Hedera Consensus Service bridge
 *
 * Three exported functions:
 *   1. buildCheckoutProposal()  — formats an OTC proposal as a UCP checkout envelope
 *   2. publishProposal()        — signs the envelope and submits it to an HCS topic
 *   3. subscribeProposals()     — subscribes to HCS, verifies sender wallet, calls back
 *
 * All HCS messages carry real Hedera consensus timestamps and sequence numbers.
 * No mock payloads — submissions that fail will throw.
 */

import crypto from "crypto";
import { ethers } from "ethers";
import {
  Client,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import {
  CheckoutEnvelope,
  CheckoutPayload,
  HcsUcpMessage,
  UcpEnvelope,
  UCP_CHECKOUT,
} from "../types/ucp";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the canonical JSON string for signing — every field
 * in envelope key-insertion order, except the `signature` field itself.
 */
function canonical<T>(envelope: UcpEnvelope<T>): string {
  const { signature: _omit, ...rest } = envelope as unknown as Record<string, unknown>;
  return JSON.stringify(rest);
}

/** Normalise a private-key string: strip 0x prefix so ethers.Wallet can use it */
function normaliseKey(hex: string): string {
  return "0x" + hex.replace(/^0x/i, "");
}

const messageEncryptionKey =
  process.env.MESSAGE_ENCRYPTION_KEY || "agentfi-local-encryption-key-32bytes";

function encryptionKeyBuffer(): Buffer {
  return crypto.createHash("sha256").update(messageEncryptionKey).digest();
}

// Incoming HCS messages may be either plaintext JSON or AES-256-GCM base64.
// Try to decrypt first; if that fails, treat as plaintext.
function decryptMaybe(text: string): string {
  try {
    const data = Buffer.from(text, "base64");
    if (data.length < 29) {
      return text;
    }
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const encrypted = data.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKeyBuffer(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// 1. Build a UCP checkout proposal (unsigned)
// ---------------------------------------------------------------------------

/**
 * Formats an OTC trading proposal as a UCP dev.ucp.trading.checkout envelope.
 *
 * @param trade       Trade parameters expressed in token smallest units.
 * @param senderAddress EVM address (0x…) of the agent submitting the proposal.
 * @returns           Unsigned CheckoutEnvelope — pass to publishProposal() to sign.
 */
export function buildCheckoutProposal(
  trade: {
    requestId: string;
    /** Optional original Hedera account ID (0.0.x) for settlement routing */
    initiatorAccount?: string;
    /** HTS token ID being sold, e.g. "0.0.8169931" */
    sellToken: string;
    /** Amount in token's smallest unit (6 decimals → multiply USD amount × 1_000_000) */
    sellAmountSmallestUnit: bigint;
    /** "HBAR" or an HTS token ID */
    buyToken: string;
    /** Limit price: tinybars per sell-token unit (HBAR × 100_000_000) */
    limitPriceSmallestUnit: bigint;
    /** Slippage tolerance in basis points. Default: 50 (= 0.5 %) */
    slippageBps?: number;
    /** Seconds until expiry from now. Default: 300 (5 minutes) */
    ttlSeconds?: number;
    /** Deployed AtomicSwap contract address */
    escrowContract: string;
  },
  senderAddress: string
): CheckoutEnvelope {
  const payload: CheckoutPayload = {
    requestId: trade.requestId,
    initiatorAccount: trade.initiatorAccount,
    sellToken: trade.sellToken,
    sellAmount: trade.sellAmountSmallestUnit.toString(),
    buyToken: trade.buyToken,
    limitPrice: trade.limitPriceSmallestUnit.toString(),
    slippageBps: trade.slippageBps ?? 50,
    expiry: Math.floor(Date.now() / 1000) + (trade.ttlSeconds ?? 300),
    escrowContract: trade.escrowContract,
  };

  return {
    capability: UCP_CHECKOUT,
    version: "1.0",
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sender: senderAddress,
    signature: "", // populated by publishProposal
    payload,
  };
}

// ---------------------------------------------------------------------------
// 2. Sign and submit a UCP envelope to an HCS topic
// ---------------------------------------------------------------------------

/**
 * Signs the checkout proposal with an EIP-191 ECDSA signature and submits
 * the stringified JSON payload to the specified Hedera HCS topic.
 *
 * The signature covers the canonical envelope (all fields except `signature`),
 * so any verifier can replay: ethers.verifyMessage(canonical, sig) === sender.
 *
 * @param client             Initialised Hedera SDK client.
 * @param topicId            HCS topic ID, e.g. "0.0.8170000".
 * @param envelope           Unsigned envelope from buildCheckoutProposal().
 * @param signerPrivateKeyHex 32-byte ECDSA private key hex (with or without 0x).
 */
export async function publishProposal(
  client: Client,
  topicId: string,
  envelope: CheckoutEnvelope,
  signerPrivateKeyHex: string
): Promise<void> {
  const wallet = new ethers.Wallet(normaliseKey(signerPrivateKeyHex));
  // Canonical sender must match the signing key so downstream verification succeeds.
  const canonicalEnvelope: CheckoutEnvelope = {
    ...envelope,
    sender: wallet.address,
  };

  const body = canonical(canonicalEnvelope);
  const signature = await wallet.signMessage(body);

  const signed: CheckoutEnvelope = { ...canonicalEnvelope, signature };

  await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(signed))
    .execute(client);
}

// ---------------------------------------------------------------------------
// 3. Subscribe to HCS topic, parse UCP messages, verify sender wallet
// ---------------------------------------------------------------------------

/**
 * Opens a persistent subscription to an HCS topic and delivers verified
 * UCP checkout messages to the caller.
 *
 * Each resolved message includes:
 *   - Real Hedera consensus timestamp  (not the sender's clock)
 *   - Monotonic sequence number        (topic-scoped)
 *   - signatureVerified flag           (ethers.verifyMessage === envelope.sender)
 *
 * Non-checkout messages and parse errors are silently dropped with a warning.
 * Signature mismatches are logged but still delivered (signatureVerified=false)
 * so the caller can decide how to handle them.
 *
 * @param client    Initialised Hedera SDK client.
 * @param topicId   HCS topic ID to subscribe to.
 * @param onMessage Callback invoked for every validated UCP checkout message.
 * @param onError   Optional error handler for subscription-level errors.
 * @param startTime If provided, replay messages from this point in time.
 *                  Defaults to "now" (only new messages).
 */
export function subscribeProposals(
  client: Client,
  topicId: string,
  onMessage: (msg: HcsUcpMessage) => void,
  onError?: (err: Error) => void,
  startTime?: Date
): void {
  const query = new TopicMessageQuery().setTopicId(topicId);

  // Default to server start time so we don't replay all historical messages
  query.setStartTime(startTime ?? new Date());

  query.subscribe(
    client,
    // Error handler
    (err) => {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      if (onError) {
        onError(wrapped);
      } else {
        console.error("[ucpBus] HCS subscription error:", wrapped.message);
      }
    },
    // Message handler
    (rawMsg) => {
      if (!rawMsg?.contents) return;

      // ── Extract Hedera consensus metadata (authoritative network timestamps) ──
      const secs = rawMsg.consensusTimestamp?.seconds?.toString() ?? "0";
      const nanosRaw = rawMsg.consensusTimestamp?.nanos;
      const nanos = String(
        typeof nanosRaw === "number" ? nanosRaw : (nanosRaw as { toNumber?: () => number })?.toNumber?.() ?? 0
      ).padStart(9, "0");
      const consensusTimestamp = `${secs}.${nanos}`;
      const sequenceNumber = rawMsg.sequenceNumber?.toString() ?? "0";

      // ── Parse the HCS message as a UCP envelope ──
      const rawText = Buffer.from(rawMsg.contents).toString("utf8");
      const text = decryptMaybe(rawText);
      let envelope: CheckoutEnvelope;
      try {
        envelope = JSON.parse(text) as CheckoutEnvelope;
      } catch {
        console.warn(`[ucpBus] seq=${sequenceNumber} — dropped: not valid JSON`);
        return;
      }

      // Skip non-checkout capabilities silently (other phases may share this topic)
      if (envelope.capability !== UCP_CHECKOUT) {
        return;
      }

      // ── Verify EIP-191 sender wallet signature ──
      let signatureVerified = false;
      try {
        const body = canonical(envelope);
        const recovered = ethers.verifyMessage(body, envelope.signature);
        signatureVerified =
          recovered.toLowerCase() === envelope.sender.toLowerCase();

        if (!signatureVerified) {
          console.warn(
            `[ucpBus] SIGNATURE MISMATCH seq=${sequenceNumber}` +
              ` claimed=${envelope.sender} recovered=${recovered}`
          );
        }
      } catch (e) {
        console.warn(`[ucpBus] seq=${sequenceNumber} signature error:`, e);
      }

      // ── Log with real consensus timestamp and sequence number ──
      console.log(
        `[ucpBus] ← seq=${sequenceNumber} ts=${consensusTimestamp}` +
          ` sender=${envelope.sender} verified=${signatureVerified}` +
          ` id=${envelope.id}`
      );

      onMessage({
        envelope,
        consensusTimestamp,
        sequenceNumber,
        signatureVerified,
      });
    }
  );
}
