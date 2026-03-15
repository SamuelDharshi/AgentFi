const crypto = require("crypto");
const path = require("path");
const { spawn } = require("child_process");
const dotenv = require("dotenv");
const {
  Client,
  PrivateKey,
  TokenId,
  TopicCreateTransaction,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
} = require("@hashgraph/sdk");
const { ethers } = require("ethers");

const envCandidates = [
  process.env.PHASE5_ENV_FILE,
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../.env.local"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../.env.local"),
].filter(Boolean);

for (const candidate of envCandidates) {
  dotenv.config({ path: candidate, override: false, quiet: true });
}

const UCP_CHECKOUT = "dev.ucp.trading.checkout";
const UCP_ACCEPT = "dev.ucp.trading.accept";
const ONE_HBAR_TINYBAR = 100_000_000n;
const INT64_MAX = 9_223_372_036_854_775_807n;
const ZERO_ADDRESS = ethers.ZeroAddress;

const ATOMIC_SWAP_READ_ABI = [
  "function getTrade(bytes32 tradeId) view returns (tuple(address marketAgent,address user,address htsToken,int64 tokenAmount,uint256 hbarAmountTinybars,uint256 deadline,uint8 state))",
];

const REPUTATION_ABI = [
  "function getReputation(address agent) view returns (tuple(uint256 score,uint256 tradeCount,uint256 lastUpdatedAt))",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in backend/.env, workspace .env, or pass PHASE5_ENV_FILE=<path>.`
    );
  }
  return value.trim();
}

function parsePositiveInt(value, fallback) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parsePositiveBigInt(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normaliseHexKey(key) {
  return key.startsWith("0x") ? key : `0x${key}`;
}

function canonical(envelope) {
  const { signature: _omit, ...rest } = envelope;
  return JSON.stringify(rest);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function absDiff(a, b) {
  return a >= b ? a - b : b - a;
}

function pow10(decimals) {
  return 10n ** BigInt(decimals);
}

function minBigInt(values) {
  return values.reduce((acc, v) => (v < acc ? v : acc));
}

function toTradeId(requestId) {
  return ethers.keccak256(ethers.toUtf8Bytes(requestId));
}

function tokenIdToAddress(tokenIdOrAddress) {
  if (tokenIdOrAddress.startsWith("0x")) {
    return ethers.getAddress(tokenIdOrAddress);
  }
  const solidity = TokenId.fromString(tokenIdOrAddress).toSolidityAddress();
  return ethers.getAddress(`0x${solidity}`);
}

function verifyEnvelopeSignature(envelope) {
  try {
    const recovered = ethers.verifyMessage(canonical(envelope), envelope.signature);
    return recovered.toLowerCase() === String(envelope.sender).toLowerCase();
  } catch {
    return false;
  }
}

function parseTupleField(tuple, key, index) {
  if (tuple && tuple[key] !== undefined) {
    return tuple[key];
  }
  return tuple[index];
}

function buildConfigFromEnv() {
  const network = (process.env.HEDERA_NETWORK ?? "testnet").toLowerCase();
  if (network !== "testnet") {
    throw new Error("Phase 5 live suite supports only HEDERA_NETWORK=testnet");
  }

  if (process.env.MOCK_HEDERA === "true") {
    throw new Error("Phase 5 live suite requires MOCK_HEDERA=false");
  }

  return {
    network,
    operatorId: requireEnv("HEDERA_OPERATOR_ID"),
    operatorKey: requireEnv("HEDERA_OPERATOR_KEY"),
    mirrorNodeApiBaseUrl:
      process.env.MIRROR_NODE_API_BASE_URL ??
      "https://testnet.mirrornode.hedera.com/api/v1",
    jsonRpcUrl: process.env.HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api",
    atomicSwapAddress: ethers.getAddress(requireEnv("ATOMIC_SWAP_ADDRESS")),
    registryAddress: ethers.getAddress(requireEnv("ERC8004_REGISTRY_ADDRESS")),
    htsTokenId: requireEnv("HTS_TOKEN_ID"),
    userAccountId: requireEnv("USER_ACCOUNT_ID"),
    marketAccountId: requireEnv("MARKET_AGENT_ACCOUNT_ID"),
    userEvmAddress: process.env.USER_EVM_ADDRESS?.trim() || undefined,
    marketEvmAddress: process.env.MARKET_AGENT_EVM_ADDRESS?.trim() || undefined,
    userEvmKey: requireEnv("USER_EVM_KEY"),
    marketEvmKey:
      process.env.MARKET_AGENT_EVM_KEY?.trim() || requireEnv("HEDERA_OPERATOR_EVM_KEY"),
    sellTokenDecimals: parsePositiveInt(process.env.HEADLESS_SELL_TOKEN_DECIMALS, 6),
    limitPriceTinybarPerToken: parsePositiveBigInt(
      process.env.HEADLESS_LIMIT_PRICE_TINYBAR,
      8_500_000n
    ),
    successTargetPayoutTinybar: parsePositiveBigInt(
      process.env.PHASE5_TARGET_PAYOUT_TINYBAR,
      5n * ONE_HBAR_TINYBAR
    ),
    feeToleranceTinybar: parsePositiveBigInt(
      process.env.PHASE5_HBAR_FEE_TOLERANCE_TINYBAR,
      2n * ONE_HBAR_TINYBAR
    ),
    timeoutMs: parsePositiveInt(process.env.PHASE5_E2E_TIMEOUT_MS, 600_000),
    balanceSyncTimeoutMs: parsePositiveInt(
      process.env.PHASE5_BALANCE_SYNC_TIMEOUT_MS,
      180_000
    ),
    balanceSyncPollMs: parsePositiveInt(process.env.PHASE5_BALANCE_SYNC_POLL_MS, 5_000),
  };
}

function createHederaClient(config) {
  const client =
    config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(config.operatorId, PrivateKey.fromStringDer(config.operatorKey));
  return client;
}

async function createTopic(client, memo) {
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).execute(client);
  const receipt = await tx.getReceipt(client);
  if (!receipt.topicId) {
    throw new Error("Failed to create HCS topic for Phase 5 test");
  }
  return receipt.topicId.toString();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status} for ${url}: ${body}`);
  }

  return response.json();
}

async function getAccountHbarTinybar(mirrorBaseUrl, accountId) {
  const base = mirrorBaseUrl.endsWith("/")
    ? mirrorBaseUrl.slice(0, -1)
    : mirrorBaseUrl;
  const data = await fetchJson(`${base}/accounts/${accountId}`);
  const balance = data?.balance?.balance;
  if (balance === undefined) {
    throw new Error(`Missing HBAR balance in mirror response for ${accountId}`);
  }
  return BigInt(String(balance));
}

async function getTokenBalance(mirrorBaseUrl, tokenId, accountId) {
  const base = mirrorBaseUrl.endsWith("/")
    ? mirrorBaseUrl.slice(0, -1)
    : mirrorBaseUrl;

  const data = await fetchJson(
    `${base}/tokens/${tokenId}/balances?account.id=${encodeURIComponent(accountId)}&limit=1`
  );

  const balance = data?.balances?.[0]?.balance;
  return balance === undefined ? 0n : BigInt(String(balance));
}

async function getBalances(config) {
  const [userHbar, marketHbar, userToken, marketToken] = await Promise.all([
    getAccountHbarTinybar(config.mirrorNodeApiBaseUrl, config.userAccountId),
    getAccountHbarTinybar(config.mirrorNodeApiBaseUrl, config.marketAccountId),
    getTokenBalance(config.mirrorNodeApiBaseUrl, config.htsTokenId, config.userAccountId),
    getTokenBalance(config.mirrorNodeApiBaseUrl, config.htsTokenId, config.marketAccountId),
  ]);

  return {
    userHbar,
    marketHbar,
    userToken,
    marketToken,
  };
}

async function readReputation(registryContract, marketAddress) {
  const rep = await registryContract.getReputation(marketAddress);
  return {
    score: BigInt(String(parseTupleField(rep, "score", 0))),
    tradeCount: BigInt(String(parseTupleField(rep, "tradeCount", 1))),
    lastUpdatedAt: BigInt(String(parseTupleField(rep, "lastUpdatedAt", 2))),
  };
}

async function readTrade(atomicSwapContract, tradeId) {
  const trade = await atomicSwapContract.getTrade(tradeId);
  return {
    marketAgent: ethers.getAddress(String(parseTupleField(trade, "marketAgent", 0))),
    user: ethers.getAddress(String(parseTupleField(trade, "user", 1))),
    htsToken: ethers.getAddress(String(parseTupleField(trade, "htsToken", 2))),
    tokenAmount: BigInt(String(parseTupleField(trade, "tokenAmount", 3))),
    hbarAmountTinybars: BigInt(String(parseTupleField(trade, "hbarAmountTinybars", 4))),
    deadline: BigInt(String(parseTupleField(trade, "deadline", 5))),
    state: Number(parseTupleField(trade, "state", 6)),
  };
}

async function submitEnvelope(client, topicId, envelope) {
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(envelope))
    .execute(client);
  await tx.getReceipt(client);
}

async function signEnvelope(envelope, privateKeyHex) {
  const wallet = new ethers.Wallet(normaliseHexKey(privateKeyHex));
  const canonicalEnvelope = {
    ...envelope,
    sender: wallet.address,
    signature: "",
  };
  const signature = await wallet.signMessage(canonical(canonicalEnvelope));
  return {
    ...canonicalEnvelope,
    signature,
  };
}

async function runHeadlessOrchestrator(extraEnv, timeoutMs) {
  const backendRoot = path.resolve(__dirname, "..");
  const isWindows = process.platform === "win32";
  const npmCmd = isWindows ? "npm.cmd" : "npm";

  return new Promise((resolve, reject) => {
    const child = spawn(npmCmd, ["run", "orchestrate:headless"], {
      cwd: backendRoot,
      env: { ...process.env, ...extraEnv },
      // On Windows, .cmd scripts require a shell launcher.
      shell: isWindows,
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`orchestrate:headless timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout,
        stderr,
        output: `${stdout}\n${stderr}`,
      });
    });
  });
}

async function waitForCondition(checker, timeoutMs, pollMs, timeoutMessage) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await checker();
    if (result) {
      return result;
    }
    await sleep(pollMs);
  }

  throw new Error(timeoutMessage);
}

function extractConsensusMeta(rawMsg) {
  const secs = rawMsg.consensusTimestamp?.seconds?.toString() ?? "0";
  const nanosRaw = rawMsg.consensusTimestamp?.nanos;
  const nanos = String(
    typeof nanosRaw === "number"
      ? nanosRaw
      : nanosRaw?.toNumber?.() ?? 0
  ).padStart(9, "0");

  return {
    consensusTimestamp: `${secs}.${nanos}`,
    sequenceNumber: rawMsg.sequenceNumber?.toString() ?? "0",
  };
}

async function waitForTopicEnvelope(client, topicId, startedAt, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    let subscription;

    const cleanup = () => {
      if (subscription && typeof subscription.unsubscribe === "function") {
        try {
          subscription.unsubscribe();
        } catch {
          // Best-effort cleanup; timeout/result paths already handle completion.
        }
      }
    };

    const finishResolve = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      resolve(value);
    };

    const finishReject = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const timer = setTimeout(() => {
      finishReject(
        new Error(`Timed out waiting for envelope on topic ${topicId}`)
      );
    }, timeoutMs);

    subscription = new TopicMessageQuery()
      .setTopicId(topicId)
      .setStartTime(startedAt)
      .subscribe(
        client,
        (err) => {
          finishReject(err);
        },
        (rawMsg) => {
          if (!rawMsg?.contents) return;

          let envelope;
          try {
            envelope = JSON.parse(Buffer.from(rawMsg.contents).toString("utf8"));
          } catch {
            return;
          }

          if (!envelope || typeof envelope !== "object") return;
          if (typeof envelope.capability !== "string") return;
          if (typeof envelope.signature !== "string") return;
          if (typeof envelope.sender !== "string") return;

          const matched = {
            envelope,
            signatureVerified: verifyEnvelopeSignature(envelope),
            ...extractConsensusMeta(rawMsg),
          };

          if (predicate(matched)) {
            finishResolve(matched);
          }
        }
      );
  });
}

function deriveSuccessTradePlan(config, balancesBefore) {
  const maxByMarket = balancesBefore.marketHbar / 8n;
  const maxByUserToken =
    (balancesBefore.userToken * config.limitPriceTinybarPerToken) /
    pow10(config.sellTokenDecimals);

  const targetPayout = minBigInt([
    config.successTargetPayoutTinybar,
    maxByMarket,
    maxByUserToken,
  ]);

  if (targetPayout < ONE_HBAR_TINYBAR) {
    throw new Error(
      "Insufficient balances for Phase 5 success test (need at least 1 HBAR equivalent payout)"
    );
  }

  const sellAmount =
    (targetPayout * pow10(config.sellTokenDecimals)) /
    config.limitPriceTinybarPerToken;

  if (sellAmount <= 0n) {
    throw new Error("Derived sell amount is non-positive");
  }

  if (sellAmount > INT64_MAX) {
    throw new Error("Derived sell amount exceeds int64 limit for AtomicSwap");
  }

  if (sellAmount > balancesBefore.userToken) {
    throw new Error("User token balance is insufficient for derived trade amount");
  }

  const requiredPayoutTinybar =
    (sellAmount * config.limitPriceTinybarPerToken) /
    pow10(config.sellTokenDecimals);

  return {
    sellAmount,
    requiredPayoutTinybar,
  };
}

describe("Phase 5 - Live End-to-End Multi-Agent OTC", () => {
  let config;
  let client;
  let provider;
  let userWallet;
  let marketWallet;
  let atomicSwapContract;
  let reputationContract;
  let userAddress;
  let marketAddress;

  beforeAll(async () => {
    config = buildConfigFromEnv();
    client = createHederaClient(config);
    provider = new ethers.JsonRpcProvider(config.jsonRpcUrl);

    userWallet = new ethers.Wallet(normaliseHexKey(config.userEvmKey), provider);
    marketWallet = new ethers.Wallet(normaliseHexKey(config.marketEvmKey), provider);

    userAddress = ethers.getAddress(userWallet.address);
    marketAddress = ethers.getAddress(marketWallet.address);

    if (config.userEvmAddress) {
      expect(ethers.getAddress(config.userEvmAddress)).toBe(userAddress);
    }

    if (config.marketEvmAddress) {
      expect(ethers.getAddress(config.marketEvmAddress)).toBe(marketAddress);
    }

    atomicSwapContract = new ethers.Contract(
      config.atomicSwapAddress,
      ATOMIC_SWAP_READ_ABI,
      provider
    );

    reputationContract = new ethers.Contract(
      config.registryAddress,
      REPUTATION_ABI,
      provider
    );
  });

  afterAll(async () => {
    if (client) {
      client.close();
    }
  });

  test("completes HCS negotiation, settles atomic swap, and increases market reputation", async () => {
    const topicId = await createTopic(client, `Phase5 success ${Date.now()}`);

    const balancesBefore = await getBalances(config);
    const repBefore = await readReputation(reputationContract, marketAddress);
    const plan = deriveSuccessTradePlan(config, balancesBefore);

    const run = await runHeadlessOrchestrator(
      {
        MOCK_HEDERA: "false",
        HEDERA_NETWORK: "testnet",
        HEDERA_TOPIC_ID: topicId,
        HEADLESS_SELL_AMOUNT_SMALLEST: plan.sellAmount.toString(),
        HEADLESS_LIMIT_PRICE_TINYBAR: config.limitPriceTinybarPerToken.toString(),
        HEADLESS_TIMEOUT_MS: String(config.timeoutMs),
      },
      config.timeoutMs + 60_000
    );

    if (run.code !== 0) {
      throw new Error(
        `Headless orchestration failed with exit ${run.code}\n${run.output}`
      );
    }

    expect(run.output).toContain("[Discovering]");
    expect(run.output).toContain("[Negotiating]");
    expect(run.output).toContain("[Executing]");
    expect(run.output).toContain("[Settled]");

    const settledMatch = run.output.match(
      /\[Settled\]\s+tradeId=(0x[a-fA-F0-9]{64})\s+initiateTx=(0x[a-fA-F0-9]+)\s+approveTx=(0x[a-fA-F0-9]+)\s+executeTx=(0x[a-fA-F0-9]+)/
    );

    expect(settledMatch).not.toBeNull();
    const tradeId = settledMatch[1];

    const finalState = await waitForCondition(
      async () => {
        const [balancesAfter, repAfter, trade] = await Promise.all([
          getBalances(config),
          readReputation(reputationContract, marketAddress),
          readTrade(atomicSwapContract, tradeId),
        ]);

        const userTokenDelta = balancesBefore.userToken - balancesAfter.userToken;
        const marketTokenDelta = balancesAfter.marketToken - balancesBefore.marketToken;

        const tradeExecuted =
          trade.state === 1 &&
          trade.marketAgent.toLowerCase() === marketAddress.toLowerCase() &&
          trade.user.toLowerCase() === userAddress.toLowerCase();

        const balancesMoved =
          userTokenDelta >= plan.sellAmount && marketTokenDelta >= plan.sellAmount;

        const reputationMoved =
          repAfter.tradeCount > repBefore.tradeCount && repAfter.score > repBefore.score;

        if (!tradeExecuted || !balancesMoved || !reputationMoved) {
          return null;
        }

        return {
          balancesAfter,
          repAfter,
          trade,
          userTokenDelta,
          marketTokenDelta,
        };
      },
      config.balanceSyncTimeoutMs,
      config.balanceSyncPollMs,
      "Timed out waiting for mirror node and contract state to reflect successful settlement"
    );

    const marketHbarSpent = balancesBefore.marketHbar - finalState.balancesAfter.marketHbar;
    const userHbarDelta = finalState.balancesAfter.userHbar - balancesBefore.userHbar;

    expect(finalState.trade.tokenAmount).toBe(plan.sellAmount);
    expect(finalState.trade.hbarAmountTinybars).toBe(plan.requiredPayoutTinybar);
    expect(finalState.trade.state).toBe(1);

    expect(finalState.userTokenDelta).toBeGreaterThanOrEqual(plan.sellAmount);
    expect(finalState.marketTokenDelta).toBeGreaterThanOrEqual(plan.sellAmount);

    expect(marketHbarSpent).toBeGreaterThanOrEqual(plan.requiredPayoutTinybar);
    expect(userHbarDelta).toBeGreaterThanOrEqual(
      plan.requiredPayoutTinybar - config.feeToleranceTinybar
    );

    expect(finalState.repAfter.tradeCount).toBeGreaterThan(repBefore.tradeCount);
    expect(finalState.repAfter.score).toBeGreaterThan(repBefore.score);
  });

  test("invalid acceptance signature does not execute swap and keeps wallet funds safe", async () => {
    const topicId = await createTopic(client, `Phase5 invalid-signature ${Date.now()}`);
    const startedAt = new Date();

    const balancesBefore = await getBalances(config);

    const requestId = `phase5-invalid-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const sellAmount = 1_000_000n;

    const checkoutUnsigned = {
      capability: UCP_CHECKOUT,
      version: "1.0",
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      sender: userAddress,
      signature: "",
      payload: {
        requestId,
        initiatorAccount: config.userAccountId,
        sellToken: config.htsTokenId,
        sellAmount: sellAmount.toString(),
        buyToken: "HBAR",
        limitPrice: config.limitPriceTinybarPerToken.toString(),
        slippageBps: 50,
        expiry: Math.floor(Date.now() / 1000) + 300,
        escrowContract: config.atomicSwapAddress,
      },
    };

    const checkoutSigned = await signEnvelope(checkoutUnsigned, config.userEvmKey);
    await submitEnvelope(client, topicId, checkoutSigned);

    const seenCheckout = await waitForTopicEnvelope(
      client,
      topicId,
      startedAt,
      (msg) =>
        msg.envelope.capability === UCP_CHECKOUT &&
        msg.envelope.payload?.requestId === requestId,
      90_000
    );

    expect(seenCheckout.signatureVerified).toBe(true);

    const forgedSigner = ethers.Wallet.createRandom();
    const acceptUnsigned = {
      capability: UCP_ACCEPT,
      version: "1.0",
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      sender: marketAddress,
      signature: "",
      payload: {
        requestId,
        accepted: true,
        marketAccountId: config.marketAccountId,
        marketAddress,
        requiredHbarTinybars: "1",
        reason: "forged signature test",
      },
    };

    const forgedCanonical = canonical(acceptUnsigned);
    const forgedSignature = await forgedSigner.signMessage(forgedCanonical);
    const invalidAccept = {
      ...acceptUnsigned,
      signature: forgedSignature,
    };

    await submitEnvelope(client, topicId, invalidAccept);

    const seenAccept = await waitForTopicEnvelope(
      client,
      topicId,
      startedAt,
      (msg) =>
        msg.envelope.capability === UCP_ACCEPT &&
        msg.envelope.payload?.requestId === requestId,
      90_000
    );

    expect(seenAccept.signatureVerified).toBe(false);

    await sleep(8_000);

    const balancesAfter = await getBalances(config);
    const trade = await readTrade(atomicSwapContract, toTradeId(requestId));

    expect(trade.marketAgent).toBe(ZERO_ADDRESS);
    expect(trade.user).toBe(ZERO_ADDRESS);
    expect(trade.tokenAmount).toBe(0n);

    expect(balancesAfter.userToken).toBe(balancesBefore.userToken);
    expect(balancesAfter.marketToken).toBe(balancesBefore.marketToken);

    expect(absDiff(balancesAfter.userHbar, balancesBefore.userHbar)).toBeLessThanOrEqual(
      1_000_000n
    );
    expect(absDiff(balancesAfter.marketHbar, balancesBefore.marketHbar)).toBeLessThanOrEqual(
      1_000_000n
    );
  });
});
