import {
  Client,
  Hbar,
  PrivateKey,
  TopicCreateTransaction,
  TopicInfoQuery,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";

type MessageHandler = (message: string) => void;

let client: Client | null = null;
let clientCacheKey = "";

function isMockMode(): boolean {
  return (process.env.MOCK_HEDERA ?? "").toLowerCase() === "true";
}

function assertLiveMode(): void {
  if (isMockMode()) {
    throw new Error("Live Hedera client required: set MOCK_HEDERA=false");
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveConfig(): {
  network: string;
  operatorId: string;
  operatorKey: string;
} {
  assertLiveMode();

  const network = (process.env.HEDERA_NETWORK ?? "testnet").trim().toLowerCase();
  if (network !== "testnet" && network !== "mainnet") {
    throw new Error(`Unsupported HEDERA_NETWORK value: ${network}`);
  }

  return {
    network,
    operatorId: requireEnv("HEDERA_OPERATOR_ID"),
    operatorKey: requireEnv("HEDERA_OPERATOR_KEY"),
  };
}

function getClient(): Client {
  const config = resolveConfig();
  const cacheKey = `${config.network}|${config.operatorId}|${config.operatorKey}`;

  if (client && clientCacheKey === cacheKey) {
    return client;
  }

  client = config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(config.operatorId, PrivateKey.fromStringDer(config.operatorKey));
  clientCacheKey = cacheKey;
  return client;
}

export async function createTopic(memo = "AgentFi OTC Topic"): Promise<string> {
  const activeClient = getClient();
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).execute(activeClient);
  const receipt = await tx.getReceipt(activeClient);

  if (!receipt.topicId) {
    throw new Error("Topic creation failed");
  }

  return receipt.topicId.toString();
}

export async function submitMessage(topicId: string, message: string): Promise<void> {
  const activeClient = getClient();
  await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .execute(activeClient);
}

export async function subscribeTopic(topicId: string, handler: MessageHandler): Promise<void> {
  const activeClient = getClient();
  new TopicMessageQuery()
    .setTopicId(topicId)
    .subscribe(activeClient, null, (message) => {
      if (!message) {
        return;
      }

      const text = Buffer.from(message.contents).toString("utf8");
      handler(text);
    });
}

export async function transferHBAR(fromAccountId: string, toAccountId: string, amountHbar: number): Promise<string> {
  const activeClient = getClient();
  const tx = await new TransferTransaction()
    .addHbarTransfer(fromAccountId, new Hbar(-amountHbar))
    .addHbarTransfer(toAccountId, new Hbar(amountHbar))
    .execute(activeClient);

  const receipt = await tx.getReceipt(activeClient);
  return `${receipt.status.toString()}-${tx.transactionId.toString()}`;
}

export function isHederaConfigured(): boolean {
  if (isMockMode()) {
    return false;
  }
  return Boolean(process.env.HEDERA_OPERATOR_ID?.trim() && process.env.HEDERA_OPERATOR_KEY?.trim());
}

/**
 * Returns the lazily-initialised Hedera client.
 * Used by ucpBus and other modules that need the raw SDK client.
 */
export function getHcsClient(): Client {
  return getClient();
}

export async function waitForTopicAvailability(
  topicId: string,
  options?: {
    attempts?: number;
    baseDelayMs?: number;
  }
): Promise<void> {
  const activeClient = getClient();
  const maxAttempts = Math.max(1, options?.attempts ?? 6);
  let delayMs = Math.max(100, options?.baseDelayMs ?? 250);
  let lastError = "";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await new TopicInfoQuery().setTopicId(topicId).execute(activeClient);
      return;
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      lastError = details;

      const transient =
        details.includes("NOT_FOUND") ||
        details.includes("UNAVAILABLE") ||
        details.includes("INVALID_TOPIC_ID") ||
        details.includes("Connection dropped");

      if (!transient || attempt >= maxAttempts - 1) {
        break;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
      delayMs *= 2;
    }
  }

  throw new Error(
    `Topic ${topicId} not queryable after ${maxAttempts} attempts: ${lastError}`
  );
}

