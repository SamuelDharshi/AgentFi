# AgentFi OTC Trading System (Prototype)

AgentFi is an AI agent-to-agent OTC crypto trading prototype on Hedera.

Flow:

User -> AI Trading Agent -> HCS Messaging -> Market Agent -> Trade Execution

## Monorepo Structure

```
agentfi/
  frontend/
  backend/
  agents/
  README.md
```

## Tech Stack

- Frontend: Next.js, React, Tailwind, Axios
- Backend: Node.js, Express, TypeScript, OpenAI SDK, Hedera SDK
- Hedera services: HCS messaging primitives + token transfer primitives (HBAR transfer in demo)

## Features Implemented

- Chat-driven user AI agent with trade parsing + market analysis
- Encrypted agent-to-agent negotiation message layer
- HCS client module with:
  - `createTopic()`
  - `submitMessage()`
  - `subscribeTopic()`
  - `transferHBAR()`
- Market agent offer generation
- Trade execution engine
- REST API:
  - `POST /chat`
  - `POST /trade`
  - `GET /agent-status`
- Frontend routes:
  - `/chat`
  - `/trade`
  - `/agent-status`
- Live negotiation display for:
  - Trade Request Sent
  - Market Agent Offer
  - Trade Accepted
  - Trade Executed

## Setup

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
