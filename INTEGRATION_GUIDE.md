# AgentFi - Complete Project Integration

Your AgentFi monorepo is now fully integrated with a unified frontend design system. This guide covers the complete architecture and how to run everything together.

## 📁 Project Structure

```
AgentFi/
├── frontend/                 # Next.js 16 UI with new terminal design
│   ├── src/app/            # Next.js app router pages
│   ├── src/components/      # React components (ChatWindow, TradePanel, etc.)
│   ├── src/context/         # React Context (WalletContext)
│   ├── src/lib/             # API client functions
│   ├── .env.local           # Frontend environment config
│   └── package.json
│
├── backend/                 # Express.js trading orchestration
│   ├── src/
│   │   ├── agents/         # UserAgent, MarketAgent, Communication
│   │   ├── hedera/         # Hedera client & HCS integration
│   │   ├── trade/          # AtomicSwap executor
│   │   ├── hcs/            # Hedera Consensus Service
│   │   ├── openclaw/       # OpenClaw autonomous mode
│   │   ├── types/          # TypeScript messages & types
│   │   └── server.ts       # Express server + WebSocket
│   ├── .env                # Backend environment config
│   └── package.json
│
├── contracts/              # Solidity smart contracts
│   ├── AtomicSwap.sol     # Trade execution contract
│   ├── ERC8004Registry.sol # Reputation scoring
│   ├── scripts/
│   │   └── deploy.ts      # Deployment script
│   ├── test/              # Contract tests
│   └── package.json
│
├── scripts/
│   ├── setup.js           # Interactive setup wizard
│   └── run-live-e2e.ps1   # E2E test runner
│
├── package.json           # Root monorepo orchestration
└── README.md
```

## 🚀 Quick Start

### 1. Initial Setup
```bash
# Install all dependencies
npm run install:all

# OR run interactive setup wizard
npm run setup
```

### 2. Configuration Files

Create **backend/.env**:
```env
# Hedera Configuration
HEDERA_ACCOUNT_ID=0.0.XXXXX
HEDERA_PRIVATE_KEY=302e0201...
HEDERA_NETWORK=testnet

# HCS Topic
HCS_TOPIC_ID=0.0.XXXXXX

# OpenAI API
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4-turbo

# CoinGecko API (optional, has free tier)
COINGECKO_API_KEY=your_key_or_leave_blank

# Smart Contracts (After deployment)
ATOMIC_SWAP_ADDRESS=0x00000000000000000000000000000000007d9867
ERC8004_REGISTRY_ADDRESS=0x00000000000000000000000000000000007d9862
MARKET_AGENT_EVM_ADDRESS=0x6d841f79e83e4274ef4b6db14e557e8aae244f5e

# Server
PORT=4000
BACKEND_PORT=4000
```

Create **frontend/.env.local**:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_HEDERA_JSON_RPC_URL=https://testnet.hashio.io/api
NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS=0x00000000000000000000000000000000007d9862
NEXT_PUBLIC_ATOMIC_SWAP_ADDRESS=0x00000000000000000000000000000000007d9867
NEXT_PUBLIC_MARKET_AGENT_EVM_ADDRESS=0x6d841f79e83e4274ef4b6db14e557e8aae244f5e
```

### 3. Run Development Servers

```bash
# Start both backend & frontend (parallel)
npm run dev

# OR start individually
npm run dev:backend      # Runs on http://localhost:4000
npm run dev:frontend     # Runs on http://localhost:3000
```

### 4. Deploy Smart Contracts

```bash
# Compile contracts
npm run build:contracts

# Deploy to Hedera testnet
npm run deploy:contracts
```

## 🎨 Frontend Design System

The frontend has been redesigned with a new **terminal aesthetic**:

### Color Palette
- **Primary Accent**: `#a855f7` (Purple)
- **Secondary Accent**: `#3b82f6` (Blue)
- **Background**: `#050505` (Deep Black)
- **Text**: `#ffffff` (White)

### Typography
- **Body**: Space Grotesk (Google Fonts)
- **Mono**: JetBrains Mono (Google Fonts)

### Component Library
- `.terminal-card` - Dark cards with purple border gradient
- `.btn-cyan` - Primary purple buttons
- `.btn-outline` - Outlined buttons
- `.glitch-text` - Animated glitch effect for titles
- `.status-indicator` - Pulsing status dots

### Pages
- `/` - Dashboard with hero title, stat cards, feature grid
- `/chat` - UserAgent terminal for trade input
- `/trade` - Trade execution with live offer polling
- `/agent-status` - Observer dashboard

## 🔗 API Endpoints

### Backend REST API

**Chat Request**
```
POST /chat
Body: { message: string, walletAddress: string }
Returns: ChatResponse with requestId, tradeRequest, negotiation messages
```

**Trade Offer**
```
GET /trade/offer?requestId=live-XXXXX
Returns: { offer: TradePayload, negotiation: TradeMessage[] }
```

**Trade Execution**
```
POST /trade
Body: { requestId: string, accepted: boolean, walletAddress: string }
Returns: { executed: boolean, transactionId: string, ... }
```

### WebSocket Observer
```
WS ws://localhost:4000/observer
Receives: ObserverEvent (type: snapshot | state | trade | hcs)
```

## 🏗️ Architecture Diagram

```
Frontend (Next.js)
    ↓ HTTP/WebSocket
Backend (Express)
    ├── OpenAI API (GPT-4 for trade parsing)
    ├── CoinGecko API (live pricing)
    ├── Hedera SDK (HCS messaging, token transfers)
    └── Ethers.js (Smart contract interaction)
    ↓
Hedera Network (Testnet)
    ├── HCS Topic (agent-to-agent encrypted messages)
    ├── JSON-RPC EVM (contract execution)
    └── Token Service (USDC/HBAR transfers)
```

## 🤖 Agent Workflow

1. **User** connects wallet & submits trade request via `/chat`
2. **UserAgent** (OpenAI) parses intent and creates TradeRequest
3. **MarketAgent** listens on HCS topic, fetches pricing, publishes offer
4. **Frontend** polls `/trade/offer` every 3s, displays live offer
5. **User** clicks ACCEPT in `/trade` page
6. **TradeExecutor** calls AtomicSwap contract on Hedera
7. **Reputation** updated in ERC8004Registry
8. **Observer** displays execution steps in real-time

## 🧪 Testing

### E2E Tests (Live)
```bash
# Run full E2E test suite on Hedera testnet
npm run test:backend

# Run with verbose output
npm run test:backend

# Run all tests (PowerShell)
npm run test:live:all
```

### Manual Testing Flow
1. Open http://localhost:3000
2. Click "CONNECT WALLET" → approve HashPack
3. Go to `/chat` → type "Sell 1000 USDC for HBAR"
4. Click "EXECUTE" → auto-redirects to `/trade?requestId=live-XXXXX`
5. Wait for offer → click "ACCEPT TRADE"
6. Verify tx on https://hashscan.io/testnet

## 🔐 Environment Variables Summary

| Variable | Backend | Frontend | Purpose |
|----------|---------|----------|---------|
| HEDERA_ACCOUNT_ID | ✓ | - | Your Hedera account |
| HEDERA_PRIVATE_KEY | ✓ | - | Account private key |
| OPENAI_API_KEY | ✓ | - | GPT-4 model access |
| ATOMIC_SWAP_ADDRESS | ✓ | ✓ | Contract address |
| ERC8004_REGISTRY_ADDRESS | ✓ | ✓ | Registry contract |
| NEXT_PUBLIC_BACKEND_URL | - | ✓ | Backend API origin |
| NEXT_PUBLIC_HEDERA_JSON_RPC_URL | - | ✓ | RPC endpoint |

## 📦 Dependencies

### Frontend (Next.js)
- next 16.1.6
- react 19.2.3
- ethers.js 6.16.0
- hashconnect 3.0.14
- tailwindcss 4

### Backend (Express)
- express 5.2.1
- @hashgraph/sdk 2.80.0
- openai 6.27.0
- ws 8.19.0
- ethers 6.16.0

### Contracts (Hardhat)
- hardhat 2.22.0
- @nomicfoundation/hardhat-toolbox
- ethers 6.13.5
- solidity 0.8.20

## 🚨 Troubleshooting

### "Cannot find module '@hashgraph/sdk'"
```bash
# Reinstall backend dependencies
cd backend && npm install && cd ..
```

### "Backend connection refused"
- Ensure backend is running: `npm run dev:backend`
- Check PORT=4000 in backend/.env
- Verify NEXT_PUBLIC_BACKEND_URL in frontend/.env.local

### "HashPack connection failed"
- Install HashPack extension in browser
- Refresh page and retry
- Ensure wallet has testnet account

### "Contract not found at address"
- Run: `npm run deploy:contracts`
- Update .env files with new addresses
- Restart backend & frontend

## 📊 Build Status

✅ **Frontend**: Next.js 16.1.6 (Turbopack)  
✅ **Backend**: Express + TypeScript  
✅ **Contracts**: Solidity 0.8.20 (Hardhat)  
✅ **Zero Errors**: All projects compile successfully

## 🎯 Next Steps

1. ✅ Design system integrated
2. ✅ Projects coordinated in monorepo
3. ⬜ Deploy contracts to Hedera testnet
4. ⬜ Configure API keys (.env files)
5. ⬜ Run full E2E test suite
6. ⬜ Test user flow end-to-end
7. ⬜ Deploy to production

## 📞 Support

For issues:
1. Check environment variables
2. Verify all dependencies installed
3. Check console logs in browser DevTools
4. Check terminal output from backend
5. See troubleshooting section above

---

**Version**: 1.0.0  
**Updated**: March 17, 2026  
**Status**: Ready for Development
