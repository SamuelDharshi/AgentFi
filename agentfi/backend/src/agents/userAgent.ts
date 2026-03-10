import OpenAI from "openai";
import { AgentAnalysis, TradePayload } from "../types/messages";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function parseTradeText(input: string): { side: "BUY" | "SELL"; amount: number; token: string; buyToken: string } {
  const normalized = input.toUpperCase();
  const side = normalized.includes("SELL") ? "SELL" : "BUY";

  const amountMatch = input.match(/(\d+[\d,]*\.?\d*)/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : 0;

  const tokenMatch = normalized.match(/\b(HBAR|USDC|USDT|BTC|ETH)\b/g) || ["USDC", "HBAR"];
  const token = side === "SELL" ? tokenMatch[0] : tokenMatch[1] || "HBAR";
  const buyToken = side === "SELL" ? tokenMatch[1] || "HBAR" : tokenMatch[0] || "USDC";

  return { side, amount, token, buyToken };
}

export async function analyzeTrade(input: string): Promise<AgentAnalysis> {
  const fallback = {
    slippagePct: 2.3,
    riskScore: 0.42,
    recommendedPrice: 0.085,
    strategy: "OTC" as const,
    reasoning:
      "Exchange slippage: 2.3%. OTC recommendation: $0.085. Suggested execution: OTC to reduce market impact.",
  };

  if (!openai) {
    return fallback;
  }

  try {
    const response = await openai.responses.create({
      model,
      input: [
        {
          role: "system",
          content:
            "You are an OTC crypto trading assistant. Return concise JSON with slippagePct, riskScore (0-1), recommendedPrice, strategy, reasoning.",
        },
        {
          role: "user",
          content: input,
        },
      ],
      text: {
        format: {
          type: "json_object",
        },
      },
    });

    const text = response.output_text;
    const parsed = JSON.parse(text) as AgentAnalysis;
    return parsed;
  } catch {
    return fallback;
  }
}

export async function buildTradeRequest(input: string, wallet: string): Promise<{ payload: TradePayload; analysis: AgentAnalysis }> {
  const parsed = parseTradeText(input);
  const analysis = await analyzeTrade(input);

  return {
    payload: {
      wallet,
      token: parsed.token,
      amount: parsed.amount,
      price: analysis.recommendedPrice,
      buyToken: parsed.buyToken,
      timestamp: Date.now(),
      requestId: `req-${Date.now()}`,
      notes: `${parsed.side} ${parsed.amount} ${parsed.token} for ${parsed.buyToken}`,
    },
    analysis,
  };
}
