// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockHTS
 * @notice Deployed at the same address as the real Hedera HTS system-contract
 *         (0x0000000000000000000000000000000000000167) during Hardhat tests.
 *
 * Simulates HTS token association and transfer so AtomicSwap.sol can be
 * tested fully on a local Hardhat network without any Hedera connection.
 *
 * Behaviour:
 *  - associateToken  → always returns SUCCESS (22)
 *  - transferToken   → moves balances in an internal ERC-20-style ledger
 *                      returns SUCCESS (22) or INSUFFICIENT_TOKEN_BALANCE (161)
 */
contract MockHTS {
    int64 public constant SUCCESS = 22;
    int64 public constant INSUFFICIENT_BALANCE = 161;

    // token → account → balance
    mapping(address => mapping(address => int64)) private _balances;

    // ── Test helpers ─────────────────────────────────────────────────────────

    /**
     * @notice Mint tokens into an account (called by test setup to fund user).
     */
    function mintTo(address token, address account, int64 amount) external {
        _balances[token][account] += amount;
    }

    /**
     * @notice Read balance of an account for a token.
     */
    function balanceOf(address token, address account) external view returns (int64) {
        return _balances[token][account];
    }

    // ── IHTSPrecompile interface ──────────────────────────────────────────────

    function associateToken(
        address, /* account */
        address  /* token   */
    ) external pure returns (int64) {
        return SUCCESS;
    }

    function transferToken(
        address token,
        address sender,
        address recipient,
        int64 amount
    ) external returns (int64) {
        if (_balances[token][sender] < amount) {
            return INSUFFICIENT_BALANCE;
        }
        _balances[token][sender] -= amount;
        _balances[token][recipient] += amount;
        return SUCCESS;
    }
}
