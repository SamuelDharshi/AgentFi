// ---------------------------------------------------------------------------
// Universal Commerce Protocol (UCP) types — Phase 2
// Capability names follow the reverse-domain standard: dev.ucp.<domain>.<action>
// ---------------------------------------------------------------------------

export const UCP_CHECKOUT = "dev.ucp.trading.checkout" as const;
export const UCP_OFFER    = "dev.ucp.trading.offer"    as const;
export const UCP_ACCEPT   = "dev.ucp.trading.accept"   as const;
export const UCP_EXECUTED = "dev.ucp.trading.executed" as const;

export type UcpCapability =
  | typeof UCP_CHECKOUT
  | typeof UCP_OFFER
  | typeof UCP_ACCEPT
  | typeof UCP_EXECUTED;

/**
 * Generic UCP envelope.
 * The `signature` field is an EIP-191 signature over the canonical envelope
 * (all fields except `signature` itself, in JSON.stringify order).
 * Verify with: ethers.verifyMessage(canonical, signature) === sender
 */
export interface UcpEnvelope<T = unknown> {
  /** Reverse-domain capability identifier */
  capability: UcpCapability;
  version: "1.0";
  /** UUID-v4 message identifier — deduplicate on this */
  id: string;
  /** ISO-8601 creation time (sender local clock, not authoritative) */
  timestamp: string;
  /** EVM address (checksummed) of the signing party */
  sender: string;
  /** EIP-191 signature over canonical(envelope) */
  signature: string;
  payload: T;
}

// ---------------------------------------------------------------------------
// dev.ucp.trading.checkout
// ---------------------------------------------------------------------------

export interface CheckoutPayload {
  /** Internal correlation ID shared across the negotiation thread */
  requestId: string;
  /** Optional Hedera account ID that initiated the request (0.0.x) */
  initiatorAccount?: string;
  /** HTS token ID being sold, e.g. "0.0.8169931" */
  sellToken: string;
  /** Amount in token's smallest unit (string to avoid JS number overflow) */
  sellAmount: string;
  /** Buy-side denomination: "HBAR" or an HTS token ID */
  buyToken: string;
  /** Limit price in buy-token tinybars per sell-token unit (string) */
  limitPrice: string;
  /** Max acceptable slippage in basis points (50 = 0.5 %) */
  slippageBps: number;
  /** Unix-seconds deadline for this proposal to remain valid */
  expiry: number;
  /** Deployed AtomicSwap contract that will settle the trade */
  escrowContract: string;
}

export type CheckoutEnvelope = UcpEnvelope<CheckoutPayload>;

// ---------------------------------------------------------------------------
// Decoded HCS message with on-chain consensus metadata
// ---------------------------------------------------------------------------

export interface HcsUcpMessage {
  envelope: CheckoutEnvelope;
  /**
   * Authoritative Hedera consensus timestamp — NOT the sender's clock.
   * Format: "<unix-seconds>.<nanos-9-digits>", e.g. "1773259200.123456789"
   */
  consensusTimestamp: string;
  /** Monotonically increasing per-topic sequence number */
  sequenceNumber: string;
  /** true when ethers.verifyMessage confirmed the sender field matches the signature */
  signatureVerified: boolean;
}
