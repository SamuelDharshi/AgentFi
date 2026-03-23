# AgentFi - AI-Native OTC Trading on Hedera

**AgentFi** is a fully autonomous AI agent-to-agent OTC trading system running on Hedera. Two AI agents negotiate and execute trades directly on-chain—no human intermediary needed.

```
┌─────────────────────────────────────────────────────────────────┐
│                     AGENTFI TRADING FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User connects wallet  →  Types trade intent (e.g., "sell 1k    │
│  USDC for HBAR") → UserAgent (OpenAI) parses intent →           │
│  MarketAgent (OpenAI) generates offer via HCS topic →           │
│  Frontend displays live offer → User accepts → TradeExecutor    │
│  submits AtomicSwap contract call → Settlement on Hedera        │
│                                                                 │
│  ✅ Reputation tracking (ERC-8004)                             │
│  ✅ Live pricing (CoinGecko)                                   │
│  ✅ Encrypted HCS messaging                                    │
│  ✅ Token atomic settlement                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start (2 minutes)

```bash
# 1. Clone and install
git clone <repo>
cd AgentFi
npm run install:all

# 2. Configure (interactive)
npm run setup

# 3. Deploy contracts
npm run deploy:contracts

# 4. Start everything
npm run dev
```

Then:
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- WebSocket Observer: ws://localhost:4000/observer

## 📦 Monorepo Structure

```
AgentFi/
├── frontend/               # Next.js 16 + React 19 (Terminal Design)
│   ├── src/
│   │   ├── app/           # Pages: /, /chat, /trade, /agent-status
│   │   ├── components/    # ChatWindow, TradePanel, ConnectWallet, etc.
│   │   ├── context/       # WalletContext, AppContext
│   │   └── lib/           # API client, utilities
│   ├── .env.local         # Frontend config (BACKEND_URL, contract addresses)
│   └── package.json
│
├── backend/                # Express + TypeScript
│   ├── src/
│   │   ├── agents/        # UserAgent, MarketAgent, Communication
│   │   ├── hedera/        # SDK wrapper
│   │   ├── hcs/           # Consensus Service topic handling
│   │   ├── trade/         # AtomicSwap executor
│   │   ├── openclaw/      # Autonomous trading mode
│   │   ├── types/         # Message interfaces
│   │   ├── orchestration/ # Headless loop (CLI)
│   │   └── server.ts      # Express + WebSocket
│   ├── .env               # Backend config (API keys, contract addresses)
│   └── package.json
│
├── contracts/             # Solidity (Hardhat)
│   ├── AtomicSwap.sol     # Trade execution + settlement
│   ├── ERC8004Registry.sol # Reputation scoring
│   ├── scripts/
│   │   └── deploy.ts      # Hedera testnet deployment
│   └── package.json
│
├── scripts/
│   ├── setup.js           # Interactive setup wizard
│   └── run-live-e2e.ps1   # E2E test runner
│
├── package.json           # Monorepo orchestration
├── INTEGRATION_GUIDE.md   # Complete setup + architecture guide
└── README.md
```

## 🔧 Tech Stack

### Frontend (User Interface)
```
Next.js 16.1.6
  ├── React 19.2.3
  ├── TypeScript 5
  ├── Tailwind CSS 4
  ├── Ethers.js 6 (contract interaction)
  ├── HashConnect 3 (wallet integration)
  └── Framer Motion (animations)
```
###Sequence diagram
<img width="1169" height="809" alt="hede" src="https://github.com/user-attachments/assets/c79838f0-83b2-41e4-bdb7-963198dd9d6c" />
 


### Backend (Agent Orchestration)
```
Express.js 5
  ├── TypeScript 5
  ├── OpenAI SDK 6 (GPT-4 models)
  ├── Hedera SDK 2.80 (HCS, token transfers)
  ├── Ethers.js 6 (contract signing)
  ├── WebSocket (observer streaming)
  └── Axios (HTTP client)
```

### Smart Contracts (On-Chain Settlement)
```
Solidity 0.8.20 (Hardhat)
  ├── AtomicSwap.sol (trade execution)
  ├── ERC8004Registry.sol (reputation)
  └── Deployed to Hedera EVM (testnet)
```

### Blockchain (Infrastructure)
```
Hedera Testnet
  ├── Token Service (USDC transfers)
  ├── HCS Topics (agent messaging)
  ├── Smart Contracts (atomic settlement)
  └── Mirror Node (queries, events)
```

## 📋 Features

### ✅ User Experience
- **Chat Interface**: Natural language trade requests
- **Live Offers**: Real-time market agent pricing updates
- **Wallet Integration**: HashPack wallet support
- **Trade Execution**: One-click trade acceptance
- **Status Dashboard**: Real-time agent activity observer

### ✅ Agent Architecture
- **UserAgent (OpenAI GPT-4)**: Parses trade intent, validates amounts
- **MarketAgent (OpenAI GPT-4)**: Generates competitive offers based on market data
- **Communication Module**: Encrypted HCS message exchange
- **TradeExecutor**: Atomic swap contract execution

### ✅ Blockchain Features
- **HCS Topics**: Encrypted agent-to-agent messaging
- **Token Transfers**: USDC/HBAR settlement
- **Smart Contracts**: Atomic swap logic (prevent partial fills)
- **Reputation Scoring**: ERC-8004 on-chain reputation registry

### ✅ APIs
- `POST /chat` - Submit trade intent
- `GET /trade/offer?requestId=...` - Poll for market offer
- `POST /trade` - Execute accepted trade
- `WS /observer` - Real-time agent event stream

## 🎯 Setup

### Prerequisites
- Node.js 18+ (`node --version`)
- npm 9+ (`npm --version`)
- HashPack wallet extension (for testing on-chain)

### Environment Variables

**Backend (.env)**:
```
HEDERA_ACCOUNT_ID=0.0.XXXXX
HEDERA_PRIVATE_KEY=302e020100...
HEDERA_NETWORK=testnet
OPENAI_API_KEY=sk-...
ATOMIC_SWAP_ADDRESS=0x...
ERC8004_REGISTRY_ADDRESS=0x...
PORT=4000
```

**Frontend (.env.local)**:
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_HEDERA_JSON_RPC_URL=https://testnet.hashio.io/api
NEXT_PUBLIC_ATOMIC_SWAP_ADDRESS=0x...
NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=0x...
```

### Installation

```bash
# Install all dependencies
npm run install:all

# OR run interactive setup wizard
npm run setup
```

### Configure
Create `.env` and `.env.local` files using templates:

- `backend/.env.example` → `backend/.env`
- `frontend/.env.local.example` → `frontend/.env.local`

See [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for detailed configuration.

## 🏃 Running

### Development (Both Services)
```bash
npm run dev
# Starts backend (port 4000) + frontend (port 3000) concurrently
```

### Individual Services
```bash
npm run dev:backend     # Express on port 4000
npm run dev:frontend    # Next.js on port 3000
```

### Build All
```bash
npm run build:all
# Compiles contracts → backend → frontend
```

### Deploy Contracts
```bash
npm run deploy:contracts
# Builds and deploys AtomicSwap + ERC8004Registry to Hedera testnet
```

## 🧪 Testing

### E2E Test Suite
```bash
npm run test:backend
# Runs full trading flow on live Hedera testnet
```

### Manual Testing Flow
1. Open http://localhost:3000
2. Click **"CONNECT WALLET"** → approve HashPack
3. Go to **/chat** → type: `"Sell 1000 USDC for HBAR"`
4. Click **"EXECUTE"** → auto-redirects to `/trade`
5. Wait for live offer (~3-5 seconds)
6. Click **"ACCEPT TRADE"** → settlement on Hedera
7. Verify tx on [HashScan Testnet](https://hashscan.io/testnet)

## 📚 Documentation

- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - Complete architecture + setup guide
- [backend/README.md](./backend/README.md) - Backend API documentation
- [frontend/README.md](./frontend/README.md) - Frontend component guide
- [contracts/README.md](./contracts/README.md) - Smart contract documentation

## 🚨 Troubleshooting

### "Cannot connect to backend"
```bash
# Verify backend is running
npm run dev:backend

# Check NEXT_PUBLIC_BACKEND_URL in frontend/.env.local
# Should match backend PORT (default http://localhost:4000)
```

### "HashPack connection failed"
- Install HashPack extension from Chrome Web Store
- Ensure you have a testnet account
- Refresh browser and retry

### "Contract not deployed"
```bash
# Deploy contracts to Hedera testnet
npm run deploy:contracts

# Copy new addresses to .env files:
# ATOMIC_SWAP_ADDRESS=0x...
# ERC8004_REGISTRY_ADDRESS=0x...
```

---

**Version**: 1.0.0  
**Status**: ✅ Development Ready  
**Network**: Hedera Testnet

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Optional configuration in `.env`:

- `MOCK_HEDERA=true` for local demo mode (default in template)
- Add Hedera operator credentials for real testnet/mainnet operations
- Add `OPENAI_API_KEY` to enable live LLM reasoning

### 2) Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

### 3) Open App

- Frontend: http://localhost:3000
- Backend: http://localhost:4000

## Demo Scenario

1. Open `/chat`
2. Submit: `Sell 500000 USDC for HBAR`
3. Confirm generated request ID
4. Open `/trade`, paste request ID, execute trade
5. Open `/agent-status` to see health + negotiation count

## Security Notes (Prototype)

- Wallet identity is attached to all trade messages
- Negotiation messages are encrypted with AES-256-GCM in transit inside app layer
- Timestamp validation rejects stale messages older than 5 minutes

## Constraints Followed

- No smart contracts
- No orderbook engine
- Focused on AI agents, agent communication, and Hedera service integration
