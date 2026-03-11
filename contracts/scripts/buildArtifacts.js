/**
 * buildArtifacts.js
 *
 * Post-processes the raw solcjs output (*.abi + *.bin files) in ./out/ into
 * Hardhat-compatible artifact JSON files that deploy.ts can require().
 *
 * Run automatically after `solcjs` via the `compile` npm script.
 */
const fs = require("fs");
const path = require("path");

const outDir = path.resolve(__dirname, "../out");

const contracts = ["ERC8004Registry", "AtomicSwap"];

for (const name of contracts) {
  // solcjs names output files by flattening path separators with underscores:
  // ERC8004Registry.sol:ERC8004Registry → ERC8004Registry_sol_ERC8004Registry.abi
  const prefix = `${name}_sol_${name}`;

  const abiFile = path.join(outDir, `${prefix}.abi`);
  const binFile = path.join(outDir, `${prefix}.bin`);

  if (!fs.existsSync(abiFile) || !fs.existsSync(binFile)) {
    console.error(`Missing solcjs output for ${name} (expected ${prefix}.abi / .bin)`);
    process.exit(1);
  }

  const abi = JSON.parse(fs.readFileSync(abiFile, "utf8"));
  const bin = fs.readFileSync(binFile, "utf8").trim();

  const artifact = {
    contractName: name,
    abi,
    bytecode: { object: bin },
  };

  const artifactPath = path.join(outDir, `${name}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
  console.log(`✓ Artifact written: ${artifactPath}`);
}
