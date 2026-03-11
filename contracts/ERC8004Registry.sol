// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ERC-8004 Trustless Agent Standard — Identity & Reputation Registry
 *
 * Minimal implementation of the ERC-8004 Trustless Agent standard with two
 * registries: an Identity Registry (who an agent is) and a Reputation Registry
 * (on-chain score incremented on successful trade execution).
 *
 * Deployed on Hedera Testnet via the Hedera EVM (mirror of mainnet EVM JSON-RPC).
 */
contract ERC8004Registry {
    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error AlreadyRegistered(address agent);
    error NotRegistered(address agent);
    error Unauthorized(address caller);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event AgentRegistered(address indexed agent, string agentType, string metadataURI);
    event AgentDeregistered(address indexed agent);
    event ReputationIncremented(address indexed agent, uint256 delta, uint256 newScore, bytes32 indexed tradeRef);

    // -------------------------------------------------------------------------
    // Identity Registry
    // -------------------------------------------------------------------------

    struct AgentIdentity {
        bool active;
        string agentType;      // e.g. "USER_AGENT" | "MARKET_AGENT"
        string metadataURI;    // IPFS / HCS topic URI for extended metadata
        address owner;         // EOA that registered this agent
        uint256 registeredAt;
    }

    mapping(address => AgentIdentity) private _identities;
    address[] private _registeredAgents;

    // -------------------------------------------------------------------------
    // Reputation Registry
    // -------------------------------------------------------------------------

    struct ReputationRecord {
        uint256 score;          // cumulative integer score
        uint256 tradeCount;     // number of successful trades
        uint256 lastUpdatedAt;
    }

    mapping(address => ReputationRecord) private _reputation;

    // -------------------------------------------------------------------------
    // Access control: only the AtomicSwap contract may call incrementReputation
    // -------------------------------------------------------------------------

    address public atomicSwapContract;
    address public immutable deployer;

    constructor() {
        deployer = msg.sender;
    }

    /**
     * @notice Set (or update) the address of the AtomicSwap contract that is
     *         authorised to increment reputation scores. Can only be called by
     *         the original deployer.
     */
    function setAtomicSwapContract(address _atomicSwap) external {
        if (msg.sender != deployer) revert Unauthorized(msg.sender);
        atomicSwapContract = _atomicSwap;
    }

    // -------------------------------------------------------------------------
    // Identity Registry — public API
    // -------------------------------------------------------------------------

    /**
     * @notice Register an on-chain agent identity.
     * @param agent       Address representing the agent (EOA or contract).
     * @param agentType   Human-readable type label.
     * @param metadataURI URI pointing to off-chain metadata (HCS topic, IPFS CID, etc.)
     */
    function registerAgent(
        address agent,
        string calldata agentType,
        string calldata metadataURI
    ) external {
        if (_identities[agent].active) revert AlreadyRegistered(agent);

        _identities[agent] = AgentIdentity({
            active: true,
            agentType: agentType,
            metadataURI: metadataURI,
            owner: msg.sender,
            registeredAt: block.timestamp
        });

        _registeredAgents.push(agent);
        emit AgentRegistered(agent, agentType, metadataURI);
    }

    /**
     * @notice Deregister an agent. Only the original registrant may do this.
     */
    function deregisterAgent(address agent) external {
        AgentIdentity storage id = _identities[agent];
        if (!id.active) revert NotRegistered(agent);
        if (id.owner != msg.sender) revert Unauthorized(msg.sender);

        id.active = false;
        emit AgentDeregistered(agent);
    }

    /**
     * @notice Returns the identity record for an agent.
     */
    function getIdentity(address agent) external view returns (AgentIdentity memory) {
        return _identities[agent];
    }

    /**
     * @notice Returns all currently active registered agent addresses.
     */
    function getRegisteredAgents() external view returns (address[] memory active) {
        uint256 count = 0;
        for (uint256 i = 0; i < _registeredAgents.length; i++) {
            if (_identities[_registeredAgents[i]].active) count++;
        }

        active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < _registeredAgents.length; i++) {
            if (_identities[_registeredAgents[i]].active) {
                active[idx++] = _registeredAgents[i];
            }
        }
    }

    // -------------------------------------------------------------------------
    // Reputation Registry — public API
    // -------------------------------------------------------------------------

    /**
     * @notice Increment the on-chain reputation score for an agent.
     *         Called automatically by AtomicSwap on successful trade settlement.
     * @param agent     The market agent whose score is incremented.
     * @param delta     Points to add (typically 1 per trade).
     * @param tradeRef  Keccak256 reference hash of the trade (used as event index).
     */
    function incrementReputation(
        address agent,
        uint256 delta,
        bytes32 tradeRef
    ) external {
        if (msg.sender != atomicSwapContract) revert Unauthorized(msg.sender);
        if (!_identities[agent].active) revert NotRegistered(agent);

        ReputationRecord storage rep = _reputation[agent];
        rep.score += delta;
        rep.tradeCount += 1;
        rep.lastUpdatedAt = block.timestamp;

        emit ReputationIncremented(agent, delta, rep.score, tradeRef);
    }

    /**
     * @notice Returns the reputation record for an agent.
     */
    function getReputation(address agent) external view returns (ReputationRecord memory) {
        return _reputation[agent];
    }
}
