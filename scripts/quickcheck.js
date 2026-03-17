#!/usr/bin/env node
/**
 * AgentFi Quick Check - Validates monorepo setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function section(title) {
  console.log('\n' + colors.blue + '─'.repeat(60) + colors.reset);
  log(title, 'cyan');
  console.log(colors.blue + '─'.repeat(60) + colors.reset);
}

function checkFile(filePath, label) {
  const exists = fs.existsSync(filePath);
  log(`  ${exists ? '✓' : '✗'} ${label}`, exists ? 'green' : 'red');
  return exists;
}

function checkEnvVar(envPath, variable) {
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, 'utf8');
  return content.includes(`${variable}=`);
}

// Main checks
section('AgentFi Setup Verification');

// 1. Node/npm check
log('\n📦 Node.js & npm');
try {
  const nodeVersion = execSync('node --version').toString().trim();
  const npmVersion = execSync('npm --version').toString().trim();
  log(`  ✓ Node ${nodeVersion}`, 'green');
  log(`  ✓ npm ${npmVersion}`, 'green');
} catch (e) {
  log('  ✗ Node.js not found', 'red');
}

// 2. Directory structure
section('📁 Directory Structure');
checkFile('./backend/package.json', 'backend/package.json');
checkFile('./frontend/package.json', 'frontend/package.json');
checkFile('./contracts/package.json', 'contracts/package.json');
checkFile('./scripts/setup.js', 'scripts/setup.js');
checkFile('./INTEGRATION_GUIDE.md', 'INTEGRATION_GUIDE.md');

// 3. Environment templates
section('🔐 Environment Templates');
const backendEnvExists = checkFile('./backend/.env.example', 'backend/.env.example');
const frontendEnvExists = checkFile('./frontend/.env.local.example', 'frontend/.env.local.example');

// 4. Actual environment files
section('⚙️ Configuration Files');
const backendEnv = checkFile('./backend/.env', 'backend/.env (configured)');
const frontendEnv = checkFile('./frontend/.env.local', 'frontend/.env.local (configured)');

// 5. Dependencies
section('📦 Node Modules');
const backendModules = checkFile('./backend/node_modules', 'backend/node_modules');
const frontendModules = checkFile('./frontend/node_modules', 'frontend/node_modules');
const contractsModules = checkFile('./contracts/node_modules', 'contracts/node_modules');

// 6. Recommendations
section('✅ Next Steps');

if (!backendEnv) {
  log('  1. Create backend/.env:', 'yellow');
  log('     cp backend/.env.example backend/.env', 'yellow');
  log('     Then edit with your actual values\n', 'yellow');
}

if (!frontendEnv) {
  log('  2. Create frontend/.env.local:', 'yellow');
  log('     cp frontend/.env.local.example frontend/.env.local', 'yellow');
  log('     Then edit with your backend URL\n', 'yellow');
}

if (!backendModules || !frontendModules || !contractsModules) {
  log('  3. Install dependencies:', 'yellow');
  log('     npm run install:all\n', 'yellow');
}

log('  4. Run development servers:', 'green');
log('     npm run dev\n', 'green');

log('  5. Open browser:', 'green');
log('     http://localhost:3000\n', 'green');

// 7. Documentation
section('📚 Documentation');
log('  • INTEGRATION_GUIDE.md - Full setup & architecture', 'cyan');
log('  • README.md - Quick start guide', 'cyan');
log('  • backend/README.md - API documentation', 'cyan');
log('  • frontend/README.md - Component guide', 'cyan');

section('AgentFi Ready!');
log('\n✨ Your monorepo is configured. Run: npm run dev\n', 'green');
