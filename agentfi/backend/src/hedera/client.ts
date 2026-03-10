import {
  Client,
  Hbar,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
  TransferTransaction,
} from "@hashgraph/sdk";

type MessageHandler = (message: string) => void;

const network = process.env.HEDERA_NETWORK || "testnet";
const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKey = process.env.HEDERA_OPERATOR_KEY;
const mockHedera = process.env.MOCK_HEDERA === "true";

let client: Client | null = null;

function getClient(): Client {
  if (client) {
    return client;
  }

  if (!operatorId || !operatorKey) {
    throw new Error("Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY");
  }

  client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, PrivateKey.fromStringED25519(operatorKey));
  return client;
}

export async function createTopic(memo = "AgentFi OTC Topic"): Promise<string> {
  if (mockHedera) {
    return "0.0.mock-topic";
  }

  const activeClient = getClient();
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).execute(activeClient);
  const receipt = await tx.getReceipt(activeClient);

  if (!receipt.topicId) {
    throw new Error("Topic creation failed");
  }

  return receipt.topicId.toString();
}

export async function submitMessage(topicId: string, message: string): Promise<void> {
  if (mockHedera) {
    return;
  }

  const activeClient = getClient();
  await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(message)
    .execute(activeClient);
}

export async function subscribeTopic(topicId: string, handler: MessageHandler): Promise<void> {
  if (mockHedera) {
    return;
  }

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
  if (mockHedera) {
    return `mock-transfer-${Date.now()}`;
  }

  const activeClient = getClient();
  const tx = await new TransferTransaction()
    .addHbarTransfer(fromAccountId, new Hbar(-amountHbar))
    .addHbarTransfer(toAccountId, new Hbar(amountHbar))
    .execute(activeClient);

  const receipt = await tx.getReceipt(activeClient);
  return `${receipt.status.toString()}-${tx.transactionId.toString()}`;
}

export function isHederaConfigured(): boolean {
  if (mockHedera) {
    return true;
  }

  return Boolean(operatorId && operatorKey);
}
