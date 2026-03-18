# AgentFi Project Instructions

## Project Overview
AgentFi is a comprehensive blockchain-based trading platform built on the Hedera network. It features:
- **Backend**: Express.js server with WebSocket support for real-time trading updates
- **Frontend**: Next.js 16.1.6 (Turbopack) with React 19
- **Smart Contracts**: Solidity contracts for atomic swaps (AtomicSwap.sol, ERC8004Registry.sol)
- **Agent System**: AI-powered market and user agents for autonomous trading
- **Hedera Integration**: HCS (Hedera Consensus Service) for distributed message bus

## Key Ports
- Frontend: **3000** (Next.js dev server)
- Backend: **3001** (Express API + WebSocket)

## Critical Configuration
- Backend PORT: 3001 (set in backend/.env)
- Frontend WebSocket: ws://localhost:3001/observer
- Hedera Network: testnet
- HCS Topic: 0.0.8270343

## MCP Documentation Resources

### Hedera Documentation (Available via MCP)
Access official Hedera documentation for:
- **Smart Contracts**: https://docs.hedera.com/hedera/core-concepts/smart-contracts
- **HTS (Hedera Token Service)**: https://docs.hedera.com/hedera/core-concepts/token-service
- **HCS (Hedera Consensus Service)**: https://docs.hedera.com/hedera/core-concepts/consensus-service
- **SDK Reference**: https://docs.hedera.com/hedera/sdks-and-apis/sdks

## Architecture Notes

### Backend Structure
```
backend/src/
  ├── server.ts           # Main Express app + WebSocket server
  ├── agents/             # Market & User agents, communication layer
  ├── hedera/             # Hedera client & configuration
  ├── hcs/                # HCS message bus implementation
  ├── openclaw/           # OpenClaw autonomy system
  ├── trade/              # Trade execution logic
  ├── orchestration/      # Headless loop orchestrator
  └── types/              # TypeScript message & UCP types
```

### Frontend Structure
```
frontend/src/
  ├── app/                # Next.js app directory
  ├── components/         # React components
  ├── lib/                # Utility functions (WebSocket URLs, etc.)
  └── context/            # React context providers
```

### Contracts
```
contracts/
  ├── AtomicSwap.sol      # Core atomic swap logic (HBAR ↔ HTS tokens)
  ├── ERC8004Registry.sol # On-chain reputation tracker
  └── artifacts/          # Compiled contract ABIs
```

## Environment Variables (Backend)
```
PORT=3001
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=<your_hedera_account_id>
HEDERA_PRIVATE_KEY=<your_hedera_private_key>
OPENAI_API_KEY=<your_openai_api_key>
ATOMIC_SWAP_ADDRESS=<deployed_contract_address>
ERC8004_REGISTRY_ADDRESS=<deployed_registry_address>
```

## Build & Run Commands
```powershell
# Backend
cd backend
npm install
npm run build
npm run dev           # Compiles and runs on port 3001

# Frontend
cd frontend
npm install
npm run dev           # Runs on port 3000

# Contracts (optional - testing)
cd contracts
npm install
npx hardhat test <path>
```

## Runtime Notes
- Avoid import-time env snapshots; read process.env lazily
- Next.js HashConnect requires dynamic imports (not static)
- Phase 5 live tests should unsubscribe TopicMessageQuery after completion
- AtomicSwap reputation updates must hard-fail (no swallow)
- Hedera JSON-RPC values in wei: 1 tinybar = 10_000_000_000 wei

## Health Checks
```powershell
# Check backend health
curl http://localhost:3001/health

# Check agent status
curl http://localhost:3001/agent-status
```

## Contribution Guidelines
- All commits automatically attributed to SamuelDharshi (samueldharshi@gmail.com)
- Use descriptive commit messages
- Test locally with both services running before pushing
- Keep .env files local (exclude from git)
