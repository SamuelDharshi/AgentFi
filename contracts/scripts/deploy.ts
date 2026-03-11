import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { ethers } from "ethers";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
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

// Hedera JSON-RPC relay endpoint (Hashio public relay for testnet)
const JSON_RPC_URL =
  process.env.HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api";

// ---------------------------------------------------------------------------
// Hedera native client (for HTS + balance checks)
// ---------------------------------------------------------------------------

function getHederaClient(): Client {
  const client =
    HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(OPERATOR_ID, PrivateKey.fromStringED25519(OPERATOR_KEY_RAW));
  return client;
}

// ---------------------------------------------------------------------------
// Ethers provider pointing at Hedera EVM JSON-RPC relay
// ---------------------------------------------------------------------------

function getEthersWallet(): ethers.Wallet {
  const evmKey = requireEnv("HEDERA_OPERATOR_EVM_KEY");

  // Reject the all-zeros placeholder before ethers throws a cryptic bigint error
  const stripped = evmKey.replace(/^0x/i, "");
  if (/^0+$/.test(stripped)) {
    throw new Error(
      "HEDERA_OPERATOR_EVM_KEY is still the placeholder value (all zeros).\n\n" +
      "How to get a real ECDSA key for Hedera Testnet:\n" +
      "  1. Go to https://portal.hedera.com and sign in.\n" +
      "  2. Open your operator account → Keys → Add key → choose ECDSA.\n" +
      "  3. Copy the generated hex private key (starts with 0x…).\n" +
      "  4. Paste it into contracts/.env as HEDERA_OPERATOR_EVM_KEY=0x<your-key>\n\n" +
      "Alternatively, generate one offline with:\n" +
      "  node -e \"const {ethers}=require('ethers'); console.log(ethers.Wallet.createRandom().privateKey)\"\n" +
      "Then import that address into your Hedera account as an ECDSA alias."
    );
  }

  const provider = new ethers.JsonRpcProvider(JSON_RPC_URL);
  return new ethers.Wallet(evmKey, provider);
}

// ---------------------------------------------------------------------------
// Solidity ABI + bytecode loaders (expects solc artifacts in contracts/out/)
// ---------------------------------------------------------------------------

function loadArtifact(name: string): { abi: ethers.InterfaceAbi; bytecode: string } {
  const artifactPath = path.resolve(__dirname, `../out/${name}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Compiled artifact not found: ${artifactPath}\n` +
        `Run the compile step first:  npm run compile`
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const artifact = require(artifactPath) as {
    abi: ethers.InterfaceAbi;
    bytecode: { object: string };
  };
  return { abi: artifact.abi, bytecode: "0x" + artifact.bytecode.object };
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

  const operatorKey = PrivateKey.fromStringED25519(OPERATOR_KEY_RAW);
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

  const operatorKey = PrivateKey.fromStringED25519(OPERATOR_KEY_RAW);

  // Associate user account
  const userAssocTx = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(USER_ID))
    .setTokenIds([tokenId])
    .freezeWith(client)
    .sign(operatorKey);
  await (await userAssocTx.execute(client)).getReceipt(client);
  console.log(`      ✓ Token associated with user account ${USER_ID}`);

  // Associate market-agent account
  const agentAssocTx = await new TokenAssociateTransaction()
    .setAccountId(AccountId.fromString(MARKET_AGENT_ID))
    .setTokenIds([tokenId])
    .freezeWith(client)
    .sign(operatorKey);
  await (await agentAssocTx.execute(client)).getReceipt(client);
  console.log(`      ✓ Token associated with market-agent account ${MARKET_AGENT_ID}`);

  // Send 100,000 AUSDC to user for testing
  const transferTx = await new TransferTransaction()
    .addTokenTransfer(tokenId, OPERATOR_ID, -100_000_000_000) // 100,000 * 10^6
    .addTokenTransfer(tokenId, USER_ID, 100_000_000_000)
    .addHbarTransfer(OPERATOR_ID, new Hbar(-20))
    .addHbarTransfer(MARKET_AGENT_ID, new Hbar(20)) // Fund agent with HBAR for escrow
    .freezeWith(client)
    .sign(operatorKey);
  await (await transferTx.execute(client)).getReceipt(client);
  console.log("      ✓ Funded: 100,000 AUSDC → user;  20 HBAR → market-agent");
}

// ---------------------------------------------------------------------------
// Step 4 — Deploy ERC8004Registry contract via ethers.js
// ---------------------------------------------------------------------------

async function deployRegistry(wallet: ethers.Wallet): Promise<string> {
  console.log("\n[4/6] Deploying ERC8004Registry.sol...");
  const { abi, bytecode } = loadArtifact("ERC8004Registry");
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`      ✓ ERC8004Registry deployed at: ${address}`);
  return address;
}

// ---------------------------------------------------------------------------
// Step 5 — Deploy AtomicSwap contract via ethers.js
// ---------------------------------------------------------------------------

async function deployAtomicSwap(
  wallet: ethers.Wallet,
  registryAddress: string
): Promise<string> {
  console.log("\n[5/6] Deploying AtomicSwap.sol...");
  const { abi, bytecode } = loadArtifact("AtomicSwap");
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(registryAddress);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`      ✓ AtomicSwap deployed at: ${address}`);
  return address;
}

// ---------------------------------------------------------------------------
// Step 6 — Wire up: set AtomicSwap on Registry + register market-agent
// ---------------------------------------------------------------------------

async function wireContracts(
  wallet: ethers.Wallet,
  registryAddress: string,
  atomicSwapAddress: string
): Promise<void> {
  console.log("\n[6/6] Wiring contracts...");

  const { abi: regAbi } = loadArtifact("ERC8004Registry");
  const registry = new ethers.Contract(registryAddress, regAbi, wallet);

  // Point the registry at the AtomicSwap contract so it can call incrementReputation
  const setTx = await registry.setAtomicSwapContract(atomicSwapAddress);
  await setTx.wait();
  console.log("      ✓ Registry.setAtomicSwapContract →", atomicSwapAddress);

  // Register the market-agent identity on-chain
  const regTx = await registry.registerAgent(
    MARKET_AGENT_EVM,
    "MARKET_AGENT",
    `agentfi://agents/${MARKET_AGENT_ID}`
  );
  await regTx.wait();
  console.log(`      ✓ Market agent registered: ${MARKET_AGENT_EVM}`);

  // Register the user agent identity on-chain
  const userTx = await registry.registerAgent(
    USER_EVM,
    "USER_AGENT",
    `agentfi://agents/${USER_ID}`
  );
  await userTx.wait();
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

  const hederaClient = getHederaClient();
  const ethersWallet = getEthersWallet();

  await checkBalance(hederaClient);

  const tokenId = await createHtsToken(hederaClient);
  await fundAndAssociate(hederaClient, tokenId);

  const registryAddress = await deployRegistry(ethersWallet);
  const atomicSwapAddress = await deployAtomicSwap(ethersWallet, registryAddress);
  await wireContracts(ethersWallet, registryAddress, atomicSwapAddress);

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
