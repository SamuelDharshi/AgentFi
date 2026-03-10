import { TradeMessage } from "@/lib/api";

interface NegotiationFeedProps {
  messages: TradeMessage[];
}

const labels: Record<TradeMessage["type"], string> = {
  TRADE_REQUEST: "Trade Request Sent",
  TRADE_OFFER: "Market Agent Offer",
  TRADE_ACCEPT: "Trade Accepted",
  TRADE_EXECUTED: "Trade Executed",
};

export function NegotiationFeed({ messages }: NegotiationFeedProps) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-white/80 p-5 shadow-lg backdrop-blur">
      <h2 className="text-xl font-semibold text-[var(--ink)]">Live Negotiation Display</h2>
      <div className="mt-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No messages yet. Start by sending a chat trade request.</p>
        ) : (
          messages.map((message) => (
            <div key={`${message.type}-${message.payload.timestamp}`} className="rounded-xl bg-[var(--panel)] p-3 text-sm">
              <p className="font-semibold text-[var(--ink)]">{labels[message.type]}</p>
              <p className="text-[var(--muted)]">
                {message.payload.amount} {message.payload.token} @ {message.payload.price}
              </p>
              <p className="text-[var(--muted)]">Wallet: {message.payload.wallet}</p>
              <p className="text-[var(--muted)]">Time: {new Date(message.payload.timestamp).toLocaleTimeString()}</p>
              {message.payload.notes ? <p className="text-[var(--ink)]">{message.payload.notes}</p> : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
