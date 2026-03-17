// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Minimal HTS precompile interface used only for the token-association and
 *      transfer calls needed by the Atomic Swap contract.
 *      Full spec: https://docs.hedera.com/hedera/core-concepts/smart-contracts/system-contracts
 */
interface IHTSPrecompile {
    function transferToken(
        address token,
        address sender,
        address recipient,
        int64 amount
    ) external returns (int64 responseCode);

    function associateToken(
        address account,
        address token
    ) external returns (int64 responseCode);
}

/**
 * @dev Minimal interface matching the ERC-8004 Registry above.
 */
interface IERC8004Reputation {
    function incrementReputation(
        address agent,
        uint256 delta,
        bytes32 tradeRef
    ) external;
}

/**
 * @title AtomicSwap
 * @notice Securely exchanges a Hedera Token Service (HTS) fungible token
 *         (e.g. USDC bridged via the Hedera Token Service) for HBAR between
 *         a user and a market-agent liquidity provider.
 *
 * Trade lifecycle
 * ───────────────
 *  1. Market agent calls `initiateTrade(…)` and deposits the HBAR it is
 *     willing to pay into the contract (as msg.value).
 *  2. User calls `executeTrade(tradeId)` and sends the HTS token transfer
 *     allowance to the contract, which moves the tokens from the user to the
 *     agent and releases the locked HBAR to the user.
 *  3. On success the contract notifies the ERC-8004 Registry to increment
 *     the market agent's on-chain reputation score.
 *
 * No off-chain oracle is required; all state is settled atomically inside the
 * EVM execution on Hedera Testnet (JSON-RPC relay: https://testnet.hashio.io/api).
 */
contract AtomicSwap {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @dev Hedera Testnet HTS system-contract address (fixed by the protocol)
    address private constant HTS_PRECOMPILE = 0x0000000000000000000000000000000000000167;

    /// @dev HTS response code for SUCCESS
    int64 private constant HTS_SUCCESS = 22;

    /// @dev HTS response code for TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT
    int64 private constant HTS_TOKEN_ALREADY_ASSOCIATED = 194;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error TradeNotFound(bytes32 tradeId);
    error TradeAlreadyExists(bytes32 tradeId);
    error TradeNotOpen(bytes32 tradeId);
    error OnlyCounterParty(address caller);
    error InsufficientHBARDeposit(uint256 sent, uint256 required);
    error HTSTransferFailed(int64 code);
    error HTSAssociateFailed(int64 code);
    error TradeExpired(bytes32 tradeId, uint256 deadline);
    error WithdrawFailed();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event TradeInitiated(
        bytes32 indexed tradeId,
        address indexed marketAgent,
        address indexed user,
        address htsToken,
        int64 tokenAmount,
        uint256 hbarAmountTinybars,
        uint256 deadline
    );

    event TradeExecuted(
        bytes32 indexed tradeId,
        address indexed marketAgent,
        address indexed user,
        string settlementNote
    );

    event TradeCancelled(bytes32 indexed tradeId, address indexed cancelledBy);

    // -------------------------------------------------------------------------
    // Data
    // -------------------------------------------------------------------------

    enum TradeState { Open, Executed, Cancelled }

    struct Trade {
        address marketAgent;           // initiator — provides HBAR
        address user;                  // counter-party — provides HTS token
        address htsToken;              // HTS token contract address (Hedera mirror format 0.0.X → EVM address)
        int64  tokenAmount;            // amount of HTS tokens (in smallest denomination)
        uint256 hbarAmountTinybars;    // HBAR locked in escrow (tinybars, 1 HBAR = 10^8 tinybars)
        uint256 deadline;              // unix timestamp after which trade can be cancelled
        TradeState state;
    }

    mapping(bytes32 => Trade) private _trades;

    IERC8004Reputation public immutable reputationRegistry;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _reputationRegistry) {
        reputationRegistry = IERC8004Reputation(_reputationRegistry);
    }

    // -------------------------------------------------------------------------
    // Market Agent: initiate a trade and lock HBAR
    // -------------------------------------------------------------------------

    /**
     * @notice Called by the market agent to open a new atomic swap.
     *         The agent must send exactly `hbarAmountTinybars` tinybars as
     *         msg.value (converted from HBAR wei on Hedera EVM: 1 tinybar = 1 wei).
     *
     * @param tradeId           Unique keccak256 identifier (matches AgentFi requestId hash)
     * @param user              The user wallet that will supply the HTS token
     * @param htsToken          EVM address of the HTS fungible token (e.g. USDC)
     * @param tokenAmount       Amount of HTS tokens to receive from user
     * @param hbarAmountTinybars HBAR to pay the user (sent as msg.value)
     * @param ttlSeconds        Seconds until the trade expires and can be cancelled
     */
    function initiateTrade(
        bytes32 tradeId,
        address user,
        address htsToken,
        int64 tokenAmount,
        uint256 hbarAmountTinybars,
        uint256 ttlSeconds
    ) external payable {
        if (_trades[tradeId].marketAgent != address(0)) revert TradeAlreadyExists(tradeId);
        if (msg.value != hbarAmountTinybars) revert InsufficientHBARDeposit(msg.value, hbarAmountTinybars);

        // Pre-associate this contract with the HTS token so it can receive it
        IHTSPrecompile hts = IHTSPrecompile(HTS_PRECOMPILE);
        int64 assocCode = hts.associateToken(address(this), htsToken);
        // Accept already-associated responses from different network code variants.
        if (
            assocCode != HTS_SUCCESS &&
            assocCode != HTS_TOKEN_ALREADY_ASSOCIATED &&
            assocCode != 362
        ) {
            revert HTSAssociateFailed(assocCode);
        }

        _trades[tradeId] = Trade({
            marketAgent: msg.sender,
            user: user,
            htsToken: htsToken,
            tokenAmount: tokenAmount,
            hbarAmountTinybars: hbarAmountTinybars,
            deadline: block.timestamp + ttlSeconds,
            state: TradeState.Open
        });

        emit TradeInitiated(
            tradeId,
            msg.sender,
            user,
            htsToken,
            tokenAmount,
            hbarAmountTinybars,
            block.timestamp + ttlSeconds
        );
    }

    // -------------------------------------------------------------------------
    // User: execute (accept) the trade
    // -------------------------------------------------------------------------

    /**
     * @notice Called by the user to finalise the swap.
     *         Before calling this the user must have approved this contract as
     *         a spender for at least `tokenAmount` of the HTS token via the
     *         standard `approve(atomicSwapAddress, amount)` ERC-20 call which
     *         the HTS precompile mirrors.
     *
     * @param tradeId  The identifier returned when the trade was initiated.
     */
    function executeTrade(bytes32 tradeId) external {
        Trade storage trade = _trades[tradeId];

        if (trade.marketAgent == address(0)) revert TradeNotFound(tradeId);
        if (trade.state != TradeState.Open) revert TradeNotOpen(tradeId);
        if (msg.sender != trade.user) revert OnlyCounterParty(msg.sender);
        if (block.timestamp > trade.deadline) revert TradeExpired(tradeId, trade.deadline);

        trade.state = TradeState.Executed;

        // ── Step 1: pull HTS tokens from user → this contract ────────────────
        IHTSPrecompile hts = IHTSPrecompile(HTS_PRECOMPILE);
        int64 inCode = hts.transferToken(
            trade.htsToken,
            trade.user,         // from
            address(this),      // to (contract holds tokens momentarily)
            trade.tokenAmount
        );
        if (inCode != HTS_SUCCESS) revert HTSTransferFailed(inCode);

        // ── Step 2: forward HTS tokens from this contract → market agent ─────
        int64 outCode = hts.transferToken(
            trade.htsToken,
            address(this),
            trade.marketAgent,
            trade.tokenAmount
        );
        if (outCode != HTS_SUCCESS) revert HTSTransferFailed(outCode);

        // ── Step 3: release locked HBAR to user ───────────────────────────────
        (bool sent, ) = payable(trade.user).call{value: trade.hbarAmountTinybars}("");
        if (!sent) revert WithdrawFailed();

        // ── Step 4: increment market-agent reputation on ERC-8004 registry ────
        bytes32 ref = keccak256(
            abi.encodePacked(tradeId, trade.marketAgent, trade.user, block.timestamp)
        );
        reputationRegistry.incrementReputation(trade.marketAgent, 1, ref);

        emit TradeExecuted(
            tradeId,
            trade.marketAgent,
            trade.user,
            "Settled - reputation incremented"
        );
    }

    // -------------------------------------------------------------------------
    // Cancellation: refund HBAR if expired or by mutual agreement
    // -------------------------------------------------------------------------

    /**
     * @notice Cancel an open trade and return the locked HBAR to the market agent.
     *         Can be called by the market agent at any time, or by anyone after
     *         the deadline has passed.
     */
    function cancelTrade(bytes32 tradeId) external {
        Trade storage trade = _trades[tradeId];

        if (trade.marketAgent == address(0)) revert TradeNotFound(tradeId);
        if (trade.state != TradeState.Open) revert TradeNotOpen(tradeId);

        bool isAgent = msg.sender == trade.marketAgent;
        bool isExpired = block.timestamp > trade.deadline;

        if (!isAgent && !isExpired) revert OnlyCounterParty(msg.sender);

        trade.state = TradeState.Cancelled;

        (bool sent, ) = payable(trade.marketAgent).call{value: trade.hbarAmountTinybars}("");
        if (!sent) revert WithdrawFailed();

        emit TradeCancelled(tradeId, msg.sender);
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    function getTrade(bytes32 tradeId) external view returns (Trade memory) {
        return _trades[tradeId];
    }

    receive() external payable {}
}
