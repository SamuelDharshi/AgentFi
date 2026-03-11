import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  FileAppendTransaction,
  FileCreateTransaction,
  FileId,
  Hbar,
  PrivateKey,
  Timestamp,
  TransactionId,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TransferTransaction,
} from "@hashgraph/sdk";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

const HEDERA_NETWORK = process.env.HEDERA_NETWORK ?? "testnet";

// Operator (pays all gas / transaction fees)
const OPERATOR_ID = requireEnv("HEDERA_OPERATOR_ID");
const OPERATOR_KEY_RAW = requireEnv("HEDERA_OPERATOR_KEY");

// Market-agent account (must already exist on testnet)
const MARKET_AGENT_ID = requireEnv("MARKET_AGENT_ACCOUNT_ID");
const MARKET_AGENT_EVM = requireEnv("MARKET_AGENT_EVM_ADDRESS"); // 0x…

// User account (must already exist on testnet)
const USER_ID = requireEnv("USER_ACCOUNT_ID");
const USER_EVM = requireEnv("USER_EVM_ADDRESS"); // 0x…

// ---------------------------------------------------------------------------
// Hedera native client (for HTS + balance checks)
// ---------------------------------------------------------------------------

// Measure local clock skew vs Hedera mirror node and return seconds to backdate.
async function getClockOffset(): Promise<number> {
  try {
    const mirrorUrl =
      HEDERA_NETWORK === "mainnet"
        ? "https://mainnet-public.mirrornode.hedera.com/api/v1/transactions?limit=1"
        : "https://testnet.mirrornode.hedera.com/api/v1/transactions?limit=1";
    const res = await fetch(mirrorUrl);
    const json = (await res.json()) as { transactions: { consensus_timestamp: string }[] };
    const hederaTs = Number(json.transactions[0].consensus_timestamp.split(".")[0]);
    const localTs = Math.floor(Date.now() / 1000);
    const skew = localTs - hederaTs;
    if (skew > 5) {
      console.log(`      ⚠ Clock skew detected: local is ${skew}s ahead — backdating transactions by ${skew + 5}s`);
    }
    return skew > 5 ? skew + 5 : 0;
  } catch {
    return 0;
  }
}

let clockOffset = 0;

function validStart(): TransactionId {
  const nowSec = Math.floor(Date.now() / 1000) - clockOffset;
  const ts = new Timestamp(nowSec, 0);
  return TransactionId.withValidStart(AccountId.fromString(OPERATOR_ID), ts);
}

function getHederaClient(): Client {
  const client =
    HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(OPERATOR_ID, PrivateKey.fromStringDer(OPERATOR_KEY_RAW));
  client.setDefaultMaxTransactionFee(new Hbar(10));
  return client;
}

// ---------------------------------------------------------------------------
// Solidity bytecode loader (expects solc artifacts in contracts/out/)
// ---------------------------------------------------------------------------

function loadBytecode(name: string): string {
  const artifactPath = path.resolve(__dirname, `../out/${name}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Compiled artifact not found: ${artifactPath}\n` +
        `Run the compile step first:  npm run compile`
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const artifact = require(artifactPath) as { bytecode: { object: string } };
  return artifact.bytecode.object; // raw hex, no 0x prefix
}

// ---------------------------------------------------------------------------
// Step 1 — Verify operator account balance
// ---------------------------------------------------------------------------

async function checkBalance(client: Client): Promise<void> {
  console.log("\n[1/6] Checking operator account balance...");
  const balance = await new AccountBalanceQuery()
    .setAccountId(AccountId.fromString(OPERATOR_ID))
    .execute(client);

  const hbar = balance.hbars.toBigNumber().toNumber();
  console.log(`      Operator (${OPERATOR_ID}) balance: ${hbar} HBAR`);

  if (hbar < 50) {
    throw new Error(
      `Insufficient balance (${hbar} HBAR). Fund via https://portal.hedera.com/faucet`
    );
  }
  console.log("      ✓ Balance sufficient");
}

// ---------------------------------------------------------------------------
// Step 2 — Create a demo HTS fungible token (USDC stand-in for testnet)
// ---------------------------------------------------------------------------

async function createHtsToken(client: Client): Promise<string> {
  const existingTokenId = process.env.HTS_TOKEN_ID;
  if (existingTokenId) {
    console.log(`\n[2/6] Using existing HTS token: ${existingTokenId}`);
    return existingTokenId;
  }

  console.log("\n[2/6] Creating HTS fungible token (USDC testnet stand-in)...");

  const operatorKey = PrivateKey.fromStringDer(OPERATOR_KEY_RAW);
  const tx = await new TokenCreateTransaction()
    .setTokenName("AgentFi USD Coin")
    .setTokenSymbol("AUSDC")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(6)
    .setInitialSupply(1_000_000_000_000) // 1,000,000 USDC (6 decimals)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(AccountId.fromString(OPERATOR_ID))
    .setAdminKey(operatorKey)
    .setSupplyKey(operatorKey)
    .setTransactionValidDuration(180) // 180s window absorbs clock skew
    .setTransactionId(validStart())
    .freezeWith(client)
    .sign(operatorKey);

  const txResponse = await tx.execute(client);
  const receipt = await txResponse.getReceipt(client);

  if (!receipt.tokenId) throw new Error("HTS token creation failed");

  const tokenId = receipt.tokenId.toString();
  console.log(`      ✓ HTS token created: ${tokenId}`);
  return tokenId;
}

// ---------------------------------------------------------------------------
// Step 3 — Associate HTS token with market-agent + user accounts, fund them
// ---------------------------------------------------------------------------

async function fundAndAssociate(
  client: Client,
  tokenId: string
): Promise<void> {
  console.log("\n[3/6] Associating HTS token with user and market-agent accounts...");

  const operatorKey = PrivateKey.fromStringDer(OPERATOR_KEY_RAW);

  // Each TokenAssociateTransaction must be co-signed by the target account's key.
  // Load sub-account keys from env (ECDSA, 64-char hex, no 0x prefix).
  const userKeyRaw = process.env.USER_KEY;
  const agentKeyRaw = process.env.MARKET_AGENT_KEY;

  if (!userKeyRaw || !agentKeyRaw) {
    throw new Error(
      "USER_KEY and MARKET_AGENT_KEY must be set in contracts/.env.\n" +
        "TokenAssociateTransaction requires the target account's own key.\n" +
        "Export the ECDSA private keys from https://portal.hedera.com and add them."
    );
  }

  const userKey = PrivateKey.fromStringECDSA(userKeyRaw);
  const agentKey = PrivateKey.fromStringECDSA(agentKeyRaw);

  async function associateSafe(
    accountId: string,
    key: PrivateKey,
    label: string
  ): Promise<void> {
    try {
      const tx = await new TokenAssociateTransaction()
        .setAccountId(AccountId.fromString(accountId))
        .setTokenIds([tokenId])
        .setTransactionValidDuration(180)
        .setTransactionId(validStart())
        .freezeWith(client);
      await (await (await tx.sign(key)).execute(client)).getReceipt(client);
      console.log(`      ✓ Token associated with ${label} (${accountId})`);
    } catch (err: unknown) {
      // STATUS 194 = TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT — safe to skip
      const code = (err as { status?: { _code?: number } })?.status?._code;
      if (code === 194) {
        console.log(`      ⓘ Token already associated with ${label} — skipping`);
      } else {
        throw err;
      }
    }
  }

  await associateSafe(USER_ID, userKey, "user");
  await associateSafe(MARKET_AGENT_ID, agentKey, "market-agent");

  // Check balances to decide if the funding transfer is still needed
  const userBalance = await new AccountBalanceQuery()
    .setAccountId(AccountId.fromString(USER_ID))
    .execute(client);
  const userTokenBalance = userBalance.tokens?.get(tokenId)?.toNumber() ?? 0;

  if (userTokenBalance >= 100_000_000_000) {
    console.log("      ⓘ User already funded — skipping transfer");
  } else {
    // Send 100,000 AUSDC to user + 20 HBAR to market-agent for escrow
    const transferTx = await new TransferTransaction()
      .addTokenTransfer(tokenId, OPERATOR_ID, -100_000_000_000) // 100,000 * 10^6
      .addTokenTransfer(tokenId, USER_ID, 100_000_000_000)
      .addHbarTransfer(OPERATOR_ID, new Hbar(-20))
      .addHbarTransfer(MARKET_AGENT_ID, new Hbar(20))
      .setTransactionValidDuration(180)
      .setTransactionId(validStart())
      .freezeWith(client)
      .sign(operatorKey);
    await (await transferTx.execute(client)).getReceipt(client);
    console.log("      ✓ Funded: 100,000 AUSDC → user;  20 HBAR → market-agent");
  }
}

// ---------------------------------------------------------------------------
// Upload bytecode to a Hedera File (required when bytecode > ~4 KB)
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 4096; // bytes per FileAppend transaction

async function uploadBytecode(
  client: Client,
  operatorKey: PrivateKey,
  hexBytecode: string
): Promise<FileId> {
  // Hedera's ContractCreateTransaction expects the file to contain the bytecode
  // as a hex-encoded string (ASCII text), not raw binary bytes.
  const bytes = Buffer.from(hexBytecode); // UTF-8 encode the hex characters

  // Create the file with the first chunk
  const firstChunk = bytes.slice(0, CHUNK_SIZE);
  const createReceipt = await (
    await (
      await new FileCreateTransaction()
        .setContents(firstChunk)
        .setKeys([operatorKey.publicKey])
        .setMaxTransactionFee(new Hbar(2))
        .setTransactionValidDuration(180)
        .setTransactionId(validStart())
        .freezeWith(client)
        .sign(operatorKey)
    ).execute(client)
  ).getReceipt(client);

  const fileId = createReceipt.fileId!;

  // Append remaining chunks
  for (let offset = CHUNK_SIZE; offset < bytes.length; offset += CHUNK_SIZE) {
    const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
    await (
      await (
        await new FileAppendTransaction()
          .setFileId(fileId)
          .setContents(chunk)
          .setMaxTransactionFee(new Hbar(2))
          .setTransactionValidDuration(180)
          .setTransactionId(validStart())
          .freezeWith(client)
          .sign(operatorKey)
      ).execute(client)
    ).getReceipt(client);
  }

  return fileId;
}

// ---------------------------------------------------------------------------
// Step 4 — Deploy ERC8004Registry contract via Hedera SDK
// ---------------------------------------------------------------------------

async function deployRegistry(
  client: Client,
  operatorKey: PrivateKey
): Promise<{ address: string; contractId: ContractId }> {
  console.log("\n[4/6] Deploying ERC8004Registry.sol...");
  const bytecode = loadBytecode("ERC8004Registry");
  console.log("      Uploading bytecode to Hedera file store...");
  const fileId = await uploadBytecode(client, operatorKey, bytecode);
  console.log(`      File uploaded: ${fileId}`);

  const receipt = await (
    await (
      await new ContractCreateTransaction()
        .setBytecodeFileId(fileId)
        .setGas(2_000_000)
        .setTransactionValidDuration(180)
        .setTransactionId(validStart())
        .freezeWith(client)
        .sign(operatorKey)
    ).execute(client)
  ).getReceipt(client);

  const contractId = receipt.contractId!;
  const address = "0x" + contractId.toSolidityAddress();
  console.log(`      ✓ ERC8004Registry deployed: ${address} (${contractId})`);
  return { address, contractId };
}

// ---------------------------------------------------------------------------
// Step 5 — Deploy AtomicSwap contract via Hedera SDK
// ---------------------------------------------------------------------------

async function deployAtomicSwap(
  client: Client,
  operatorKey: PrivateKey,
  registryAddress: string
): Promise<{ address: string; contractId: ContractId }> {
  console.log("\n[5/6] Deploying AtomicSwap.sol...");
  const bytecode = loadBytecode("AtomicSwap");
  console.log("      Uploading bytecode to Hedera file store...");
  const fileId = await uploadBytecode(client, operatorKey, bytecode);
  console.log(`      File uploaded: ${fileId}`);

  const receipt = await (
    await (
      await new ContractCreateTransaction()
        .setBytecodeFileId(fileId)
        .setGas(3_000_000)
        .setConstructorParameters(
          new ContractFunctionParameters().addAddress(registryAddress)
        )
        .setTransactionValidDuration(180)
        .setTransactionId(validStart())
        .freezeWith(client)
        .sign(operatorKey)
    ).execute(client)
  ).getReceipt(client);

  const contractId = receipt.contractId!;
  const address = "0x" + contractId.toSolidityAddress();
  console.log(`      ✓ AtomicSwap deployed: ${address} (${contractId})`);
  return { address, contractId };
}

// ---------------------------------------------------------------------------
// Step 6 — Wire up: set AtomicSwap on Registry + register agents
// ---------------------------------------------------------------------------

async function wireContracts(
  client: Client,
  operatorKey: PrivateKey,
  registryContractId: ContractId,
  atomicSwapAddress: string
): Promise<void> {
  console.log("\n[6/6] Wiring contracts...");

  async function exec(fn: string, params: ContractFunctionParameters): Promise<void> {
    await (
      await (
        await new ContractExecuteTransaction()
          .setContractId(registryContractId)
          .setGas(300_000)
          .setFunction(fn, params)
          .setTransactionValidDuration(180)
          .setTransactionId(validStart())
          .freezeWith(client)
          .sign(operatorKey)
      ).execute(client)
    ).getReceipt(client);
  }

  // Point the registry at the AtomicSwap contract
  await exec("setAtomicSwapContract", new ContractFunctionParameters().addAddress(atomicSwapAddress));
  console.log("      ✓ Registry.setAtomicSwapContract →", atomicSwapAddress);

  // Register market-agent identity on-chain
  await exec(
    "registerAgent",
    new ContractFunctionParameters()
      .addAddress(MARKET_AGENT_EVM)
      .addString("MARKET_AGENT")
      .addString(`agentfi://agents/${MARKET_AGENT_ID}`)
  );
  console.log(`      ✓ Market agent registered: ${MARKET_AGENT_EVM}`);

  // Register user agent identity on-chain
  await exec(
    "registerAgent",
    new ContractFunctionParameters()
      .addAddress(USER_EVM)
      .addString("USER_AGENT")
      .addString(`agentfi://agents/${USER_ID}`)
  );
  console.log(`      ✓ User agent registered: ${USER_EVM}`);
}

// ---------------------------------------------------------------------------
// Write deployment addresses back to a JSON file for backend consumption
// ---------------------------------------------------------------------------

function saveDeployment(data: Record<string, string>): void {
  const outPath = path.resolve(__dirname, "../deployed.json");
  const existing: Record<string, string> = fs.existsSync(outPath)
    ? (JSON.parse(fs.readFileSync(outPath, "utf8")) as Record<string, string>)
    : {};
  fs.writeFileSync(
    outPath,
    JSON.stringify({ ...existing, ...data }, null, 2),
    "utf8"
  );
  console.log(`\n      Deployment addresses written to contracts/deployed.json`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════");
  console.log("  AgentFi  ·  Phase 1 Deployment Script");
  console.log(`  Network : ${HEDERA_NETWORK}`);
  console.log(`  Operator: ${OPERATOR_ID}`);
  console.log("═══════════════════════════════════════════════════");

  clockOffset = await getClockOffset();

  const hederaClient = getHederaClient();
  const operatorKey = PrivateKey.fromStringDer(OPERATOR_KEY_RAW);

  await checkBalance(hederaClient);

  const tokenId = await createHtsToken(hederaClient);
  await fundAndAssociate(hederaClient, tokenId);

  const { address: registryAddress, contractId: registryContractId } =
    await deployRegistry(hederaClient, operatorKey);
  const { address: atomicSwapAddress } =
    await deployAtomicSwap(hederaClient, operatorKey, registryAddress);
  await wireContracts(hederaClient, operatorKey, registryContractId, atomicSwapAddress);

  saveDeployment({
    network: HEDERA_NETWORK,
    htsTokenId: tokenId,
    erc8004RegistryAddress: registryAddress,
    atomicSwapAddress,
    marketAgentEvmAddress: MARKET_AGENT_EVM,
    userEvmAddress: USER_EVM,
    deployedAt: new Date().toISOString(),
  });

  console.log("\n✅  Phase 1 deployment complete.");
  console.log("   Copy these addresses into your backend/.env:");
  console.log(`     HTS_TOKEN_ID=${tokenId}`);
  console.log(`     ERC8004_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`     ATOMIC_SWAP_ADDRESS=${atomicSwapAddress}`);

  hederaClient.close();
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err);
  process.exit(1);
});
