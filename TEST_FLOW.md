# AgentFi Full Trade Flow Test Guide

## 🚀 Live Servers Status
- ✅ **Backend** running on http://localhost:3001
- ✅ **Frontend** running on http://localhost:3000/trade

## 📝 Complete 11-Step Trade Flow

### Step 0: Connect Your Wallet
1. Open **http://localhost:3000/trade** in your browser
2. Click **"Connect Wallet"** button (top left)
3. Select **HashPack** from wallet options
4. Approve connection in HashPack popup
5. Account ID should display (e.g., 0.0.123456)

### Step 1: Send Trade Request  
1. In the **CHAT WINDOW** (bottom left), type:
   ```
   Sell 100 USDC for HBAR
   ```
2. Press Enter
3. **Expected**: Chat shows message + input disabled

### Step 2-3: UserAgent Analysis → TRADE_REQUEST Published
**Time**: ~2-3 seconds

You should see in the **LIVE OBSERVER** (right side):
```
🔍 Step 1: UserAgent received trade request      [progress]
📡 Step 2: UserAgent analyzing market…           [progress]
📡 Step 3: TRADE_REQUEST published to HCS        [✓ complete]
```

### Step 4-6: MarketAgent Evaluation → TRADE_OFFER Published  
**Time**: ~3-5 seconds

```
🤖 Step 4: MarketAgent received proposal         [✓ complete]
💰 Step 5: MarketAgent calculated offer          [✓ complete]
📡 Step 6: TRADE_OFFER published to HCS          [✓ complete]
```

### Step 6a: Offer Appears in Trade Panel
In the **TRADE PANEL** (center), you'll see:
```
[LIVE OFFER]
OFFER EXPIRES IN: 4:23

YOU SEND
100.00 USDC

YOU GET
1,244.88 HBAR

PRICE: $0.0803236
SPREAD: 0.5%

[✅ ACCEPT TRADE]  [✗ REJECT]
```

### Step 7: Accept the Offer
1. Click **"✅ ACCEPT TRADE"** button
2. Confirm in HashPack wallet popup
3. **Expected**: Button shows "⏳ EXECUTING..."

```
✅ Step 7: User accepted offer                   [✓ complete]
```

### Step 8-10: Smart Contract Execution  
**Time**: ~3-5 seconds (in mock mode, instant)

```
⛓️ Step 8: AtomicSwap executing on Hedera EVM   [progress → ✓]
💸 Step 9: Token transfer confirmed              [progress → ✓]
⭐ Step 10: Reputation updated                   [progress → ✓]
```

### Step 11: Trade Complete
```
📡 Step 11: TRADE_EXECUTED published to HCS     [✓ complete]
```

In the **TRADE PANEL**, you should see:
```
✅ TRADE EXECUTED SUCCESS!

Transaction: 0x123abc...
USDC Sent: 100
HBAR Received: 1,244.88
```

## 🎯 What to Observe

### Left Side: CHAT WINDOW
- Your message appears
- Shows: Amount, Token, Analysis

### Center: TRADE PANEL  
1. **Offer appears** after 3-5 seconds
2. **Accept button** becomes clickable
3. **Success message** displays after acceptance

### Right Side: LIVE OBSERVER
- **All 11 steps** progress in real-time
- Each step shows: Icon + Description + Status
- Status transitions: queued → progress → complete

### Bottom: NEGOTIATION FEED
- TRADE_REQUEST message appears
- TRADE_OFFER message appears
- TRADE_ACCEPT message appears
- TRADE_EXECUTED message appears

## 🔧 Troubleshooting

### Issue: "Request failed with status code 500"
**Solution**: Verify `.env` has `MOCK_HEDERA=true`
```bash
# Check
cat backend/.env | findstr MOCK_HEDERA
# Should show: MOCK_HEDERA=true
```

### Issue: Offer never appears
**Solution**: Check backend console for errors
```bash
# Backend console should show:
✅ TRADE_OFFER published to HCS topic
```

### Issue: Chat input doesn't work
**Solution**: Connect wallet first
- Button should show your account ID
- Chat becomes enabled only when wallet connected

### Issue: Accept button disabled
**Solution**: Ensure wallet is connected AND offer exists
- Offer appears 3-5 seconds after chat message
- Refresh page if stuck

## 💡 Expected Timeline

| Step | Duration | Status |
|------|----------|--------|
| User sends message | 0s | ✓ |
| UserAgent analyzes | 1-2s | Start Step 1 |
| TRADE_REQUEST published | 2-3s | Complete Step 3 |
| MarketAgent evaluates | 3-5s | Start Step 4 |
| Offer appears | 5-6s | Show TRADE_PANEL |
| User accepts | 6s | User clicks button |
| Contract executes | 6-8s | Steps 8-10 |
| Success displayed | 8s | Show result |

## 🎬 Record Your Test

Try:
1. Take screenshot at Step 7 (before accept)
2. Click Accept
3. Take screenshot at Step 11 (success)

All steps should progress left-to-right:
```
queued → progress → ✓ complete
```

## 🔗 Key URLs
- **Trade Page**: http://localhost:3000/trade
- **Backend API**: http://localhost:3001
- **Chat Endpoint**: POST http://localhost:3001/chat
- **Accept Endpoint**: POST http://localhost:3001/trade

## ✅ Success Criteria
- [x] Wallet connects
- [x] Chat message sends
- [x] Steps 1-3 complete (UserAgent flow)
- [x] Step 6 shows TRADE_OFFER
- [x] Steps 4-6 complete (MarketAgent flow)
- [x] Offer appears in TRADE_PANEL
- [x] Steps 7-11 complete on accept
- [x] Success message displayed
- [x] Mock tx hash shown

**Once all criteria pass, you have a fully functional autonomous trading system!** 🎉
