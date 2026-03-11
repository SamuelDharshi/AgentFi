import { sendTradeOffer } from "./communication";
import { TradeMessage, TradePayload } from "../types/messages";

export function evaluateOffer(request: TradePayload): TradePayload {
  const discountFactor = request.amount > 250000 ? 0.9965 : 0.998;
  const offerPrice = Number((request.price * discountFactor).toFixed(6));

  return {
    ...request,
    price: offerPrice,
    timestamp: Date.now(),
    notes: "Settlement: immediate",
  };
}

export async function onTradeRequest(topicId: string, message: TradeMessage): Promise<TradePayload | null> {
  if (message.type !== "TRADE_REQUEST") {
    return null;
  }

  const offer = evaluateOffer(message.payload);
  await sendTradeOffer(topicId, offer);
  return offer;
}
