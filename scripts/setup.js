#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('\n🚀 AgentFi Setup Wizard\n');
  console.log('This wizard will help you set up AgentFi with all modules.\n');

  // Check Node version
  const nodeVersion = process.version;
  console.log(`✓ Node.js version: ${nodeVersion}`);

  // Check directories
  const dirs = ['backend', 'frontend', 'contracts'];
  let allGood = true;
  for (const dir of dirs) {
    if (fs.existsSync(path.join(__dirname, '..', dir))) {
      console.log(`✓ Found '${dir}' directory`);
    } else {
      console.log(`✗ Missing '${dir}' directory`);
      allGood = false;
    }
  }

  if (!allGood) {
    console.log('\n❌ Some directories are missing. Please ensure all folders exist.');
    rl.close();
    process.exit(1);
  }

  console.log('\n📦 Environment Setup\n');

  // Check backend .env
  const backendEnv = path.join(__dirname, '..', 'backend', '.env');
  if (!fs.existsSync(backendEnv)) {
    console.log('⚠️  Backend .env file not found.');
    const create = await askQuestion('Create backend/.env from template? (y/n) ');
    if (create.toLowerCase() === 'y') {
      const template = fs.readFileSync(path.join(__dirname, '../backend/.env.example'), 'utf8');
      fs.writeFileSync(backendEnv, template);
      console.log('✓ Created backend/.env');
    }
  } else {
    console.log('✓ Backend .env exists');
  }

  // Check frontend .env.local
  const frontendEnv = path.join(__dirname, '..', 'frontend', '.env.local');
  if (!fs.existsSync(frontendEnv)) {
    console.log('⚠️  Frontend .env.local file not found.');
    const create = await askQuestion('Create frontend/.env.local from template? (y/n) ');
    if (create.toLowerCase() === 'y') {
      const backendUrl = await askQuestion('Backend URL (default: http://localhost:4000): ') || 'http://localhost:4000';
      const hederaRpc = await askQuestion('Hedera JSON-RPC URL (default: https://testnet.hashio.io/api): ') || 'https://testnet.hashio.io/api';
      
      const envContent = `NEXT_PUBLIC_BACKEND_URL=${backendUrl}
NEXT_PUBLIC_HEDERA_JSON_RPC_URL=${hederaRpc}
NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=0x00000000000000000000000000000000007d9862
NEXT_PUBLIC_ATOMIC_SWAP_ADDRESS=0x00000000000000000000000000000000007d9867
NEXT_PUBLIC_MARKET_AGENT_EVM_ADDRESS=0x6d841f79e83e4274ef4b6db14e557e8aae244f5e
`;
      fs.writeFileSync(frontendEnv, envContent);
      console.log('✓ Created frontend/.env.local');
    }
  } else {
    console.log('✓ Frontend .env.local exists');
  }

  console.log('\n📥 Installation\n');
  const install = await askQuestion('Install dependencies for all projects? (y/n) ');
  if (install.toLowerCase() === 'y') {
    console.log('Installing dependencies... this may take a few minutes.\n');
    const { execSync } = require('child_process');
    try {
      execSync('npm install --legacy-peer-deps', { cwd: __dirname, stdio: 'inherit' });
      console.log('\n✓ Root dependencies installed');
      
      execSync('npm install', { cwd: path.join(__dirname, '..', 'backend'), stdio: 'inherit' });
      console.log('\n✓ Backend dependencies installed');
      
      execSync('npm install', { cwd: path.join(__dirname, '..', 'contracts'), stdio: 'inherit' });
      console.log('\n✓ Contracts dependencies installed');
      
      execSync('npm install', { cwd: path.join(__dirname, '..', 'frontend'), stdio: 'inherit' });
      console.log('\n✓ Frontend dependencies installed');
    } catch (err) {
      console.error('❌ Installation failed:', err.message);
    }
  }

  console.log('\n✅ Setup Complete!\n');
  console.log('Next steps:');
  console.log('1. Configure your .env files with API keys and contract addresses');
  console.log('2. Run: npm run dev              (to start backend & frontend)');
  console.log('3. Run: npm run build:contracts (to compile smart contracts)');
  console.log('4. Run: npm run deploy:contracts (to deploy on Hedera testnet)');
  console.log('\nFor more commands, run: npm run help\n');

  rl.close();
}

main().catch(console.error);
