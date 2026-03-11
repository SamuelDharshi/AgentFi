import { transferHBAR } from "../hedera/client";
import { TradePayload } from "../types/messages";

interface ExecutionResult {
  executed: boolean;
  transactionId: string;
  settlement: string;
}

export async function executeTrade(trade: TradePayload): Promise<ExecutionResult> {
  const userWallet = trade.wallet;
  const liquidityWallet = process.env.LIQUIDITY_WALLET || "0.0.6006";

  // Demo flow: if target buy token is HBAR, settle by transferring HBAR from LP to user.
  if (trade.buyToken?.toUpperCase() === "HBAR") {
    const estimatedHbar = Number((trade.amount / trade.price).toFixed(2));
    const tx = await transferHBAR(liquidityWallet, userWallet, estimatedHbar);
    return {
      executed: true,
      transactionId: tx,
      settlement: "HBAR transfer complete",
    };
  }

  return {
    executed: true,
    transactionId: `mock-hts-${Date.now()}`,
    settlement: "Token transfer mocked for non-HBAR pair",
  };
}
