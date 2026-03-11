import path from "path";
import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";

// Explicitly list the .sol files to compile so Hardhat's glob never
// descends into node_modules (the default exclusion breaks on Windows paths).
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async () => [
  path.resolve(__dirname, "ERC8004Registry.sol"),
  path.resolve(__dirname, "AtomicSwap.sol"),
  path.resolve(__dirname, "test/MockHTS.sol"),
]);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      // The HTS precompile lives at this fixed address on Hedera.
      // We deploy a MockHTS contract at the same address in the test setup.
      chainId: 31337,
    },
  },
  paths: {
    sources: "./",          // look for .sol files in contracts/ root
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  // Exclude deploy scripts and node_modules from solc
  mocha: {
    timeout: 60000,
  },
};

export default config;
