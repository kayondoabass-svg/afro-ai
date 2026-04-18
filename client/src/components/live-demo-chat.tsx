import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, MessageCircle, Sparkles } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How long does setup take?",
  "Do you support Swahili?",
  "How much does it cost?",
  "Can I pay with M-Pesa?",
];

const INITIAL: Msg = {
  role: "assistant",
  content:
    "👋 Hi! I'm a live demo of the Afro AI chatbot — actually trained on this product. Ask me anything about pricing, languages, setup, or features!",
};

export default function LiveDemoChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([INITIAL]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/demo-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: next.slice(-7) }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "Sorry, I didn't catch that." }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Connection issue — please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 bg-primary text-primary-foreground rounded-full shadow-2xl px-5 py-3.5 flex items-center gap-2 hover:scale-105 active-elevate-2 transition-transform"
          data-testid="button-open-demo-chat"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">Try the live demo</span>
          <span className="absolute -top-1.5 -right-1.5 bg-green-500 w-3.5 h-3.5 rounded-full border-2 border-background animate-pulse" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-5 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-[380px] h-[560px] max-h-[calc(100vh-2.5rem)] bg-card border border-border/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          data-testid="panel-demo-chat"
        >
          {/* Header */}
          <div className="bg-primary p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Afro AI Demo Bot</p>
                <p className="text-white/80 text-[10px] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live · trained on Afro AI itself
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white p-1"
              aria-label="Close"
              data-testid="button-close-demo-chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-background">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "gap-2"}`}>
                {m.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex-shrink-0 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm max-w-[78%] leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  }`}
                  data-testid={`msg-${m.role}-${i}`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/15 flex-shrink-0 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            {/* Suggestion chips (only on first turn) */}
            {messages.length === 1 && !loading && (
              <div className="pt-2 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Try asking
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs bg-muted hover:bg-primary/10 hover:text-primary border border-border/40 rounded-full px-3 py-1.5 transition-colors"
                      data-testid={`chip-suggestion-${s.slice(0, 10).replace(/\s/g, "-")}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-2.5 border-t border-border/40 bg-card flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              className="flex-1 text-sm bg-muted/50 border border-border/40 rounded-xl px-3.5 py-2.5 outline-none focus:border-primary/50 focus:bg-background transition-colors"
              disabled={loading}
              data-testid="input-demo-chat"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors flex-shrink-0"
              data-testid="button-send-demo-chat"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-[10px] text-center text-muted-foreground pb-2 px-2">
            This is an actual Afro AI chatbot · the same one your customers would use
          </p>
        </div>
      )}
    </>
  );
}
