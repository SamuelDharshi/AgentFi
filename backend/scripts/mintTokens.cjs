const {
  Client,
  PrivateKey,
  AccountId,
  TokenId,
  TokenMintTransaction,
  TransferTransaction,
} = require("@hashgraph/sdk");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "../.env"),
});

function getOperatorKey(raw) {
  try {
    return PrivateKey.fromStringDer(raw);
  } catch {
    return PrivateKey.fromString(raw);
  }
}

async function mintTokens() {
  const operatorIdRaw = process.env.HEDERA_OPERATOR_ID;
  const operatorKeyRaw = process.env.HEDERA_OPERATOR_KEY;
  const tokenIdRaw = process.env.HTS_TOKEN_ID;
  const userAccountRaw = process.env.USER_ACCOUNT_ID;

  if (!operatorIdRaw || !operatorKeyRaw || !tokenIdRaw || !userAccountRaw) {
    throw new Error("Missing one of required env vars: HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HTS_TOKEN_ID, USER_ACCOUNT_ID");
  }

  const operatorId = AccountId.fromString(operatorIdRaw);
  const operatorKey = getOperatorKey(operatorKeyRaw);
  const tokenId = TokenId.fromString(tokenIdRaw);
  const userAccountId = AccountId.fromString(userAccountRaw);

  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);

  console.log("Minting 1000 AUSDC...");

  const mintTx = await new TokenMintTransaction()
    .setTokenId(tokenId)
    .setAmount(1000 * 1_000_000)
    .execute(client);

  const mintReceipt = await mintTx.getReceipt(client);
  console.log("Mint status:", mintReceipt.status.toString());

  console.log(`Transferring 1000 AUSDC to user ${userAccountId.toString()}...`);

  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, operatorId, -(1000 * 1_000_000))
    .addTokenTransfer(tokenId, userAccountId, 1000 * 1_000_000)
    .execute(client);

  const transferReceipt = await transferTx.getReceipt(client);
  console.log("Transfer status:", transferReceipt.status.toString());
  console.log("Done! User now has 1000 AUSDC (if association was already completed).");
}

mintTokens().catch((err) => {
  console.error("Mint script failed:", err.message || err);
  process.exit(1);
});
