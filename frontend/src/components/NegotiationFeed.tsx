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
    <section className="panel-card p-5">
      <h2 className="panel-title">Live Negotiation Display</h2>
      <div className="mt-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400">No messages yet. Start by sending a chat trade request.</p>
        ) : (
          messages.map((message) => (
            <div
              key={`${message.type}-${message.payload.timestamp}`}
              className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 text-sm"
            >
              <p className="font-semibold text-cyan-100">{labels[message.type]}</p>
              <p className="text-slate-300">
                {message.payload.amount} {message.payload.token} @ {message.payload.price}
              </p>
              <p className="font-mono text-slate-400">Wallet: {message.payload.wallet}</p>
              <p className="font-mono text-slate-400">
                Time: {new Date(message.payload.timestamp).toLocaleTimeString()}
              </p>
              {message.payload.notes ? <p className="text-slate-200">{message.payload.notes}</p> : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
