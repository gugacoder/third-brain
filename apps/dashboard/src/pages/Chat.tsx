import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/api";
import type { ChatTokenEvent } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/StatusBadge";
import { ChatHistory } from "@/components/ChatHistory";
import { Send, StopCircle } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

const STORAGE_KEY = "third-brain-chat-session";

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function getOrCreateSessionId(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  const id = generateId();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

export function Chat() {
  const [sessionId, setSessionId] = useState(getOrCreateSessionId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [connected, setConnected] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const assistantBuffer = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Restore messages from server on mount / session change
  useEffect(() => {
    api.chat.messages(sessionId).then((data) => {
      if (data.messages.length > 0) {
        setMessages(data.messages);
      }
    }).catch(() => {
      // Session doesn't exist yet, that's fine
    });
  }, [sessionId]);

  // Connect SSE
  useEffect(() => {
    const es = new EventSource(`/sse/chat/${sessionId}`);
    esRef.current = es;

    es.addEventListener("open", () => setConnected(true));
    es.addEventListener("error", () => setConnected(false));

    es.addEventListener("token", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as ChatTokenEvent;
      if (data.text) {
        assistantBuffer.current += data.text;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return [
              ...prev.slice(0, -1),
              { role: "assistant", content: assistantBuffer.current },
            ];
          }
          return [
            ...prev,
            { role: "assistant", content: assistantBuffer.current },
          ];
        });
      }
    });

    es.addEventListener("done", () => {
      assistantBuffer.current = "";
      setStreaming(false);
      setRefreshKey((k) => k + 1);
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as ChatTokenEvent;
        if (data.error) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${data.error}` },
          ]);
        }
      } catch {
        // SSE connection error, not a data event
      }
      assistantBuffer.current = "";
      setStreaming(false);
    });

    return () => es.close();
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setStreaming(true);
    assistantBuffer.current = "";

    try {
      await api.chat.send(sessionId, text);
    } catch (err) {
      setStreaming(false);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    }
  }, [input, streaming, sessionId]);

  const handleAbort = async () => {
    await api.chat.abort(sessionId);
    setStreaming(false);
  };

  const handleNewChat = useCallback(() => {
    esRef.current?.close();
    const id = generateId();
    localStorage.setItem(STORAGE_KEY, id);
    setSessionId(id);
    setMessages([]);
    setInput("");
    setStreaming(false);
    assistantBuffer.current = "";
  }, []);

  const handleSelectSession = useCallback((id: string) => {
    if (id === sessionId) return;
    esRef.current?.close();
    localStorage.setItem(STORAGE_KEY, id);
    setSessionId(id);
    setMessages([]);
    setInput("");
    setStreaming(false);
    assistantBuffer.current = "";
  }, [sessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)]">
      {/* Sidebar */}
      <ChatHistory
        currentSessionId={sessionId}
        onSelect={handleSelectSession}
        onNewChat={handleNewChat}
        refreshKey={refreshKey}
      />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 pl-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold tracking-tight">Chat</h2>
          <StatusBadge
            status={connected ? "ok" : "error"}
            label={connected ? "Connected" : "Disconnected"}
          />
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 mb-4">
          <div className="space-y-4 pr-4">
            {messages.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-8">
                Start a conversation with Claude.
              </p>
            )}
            {messages.map((msg, i) => (
              <Card
                key={i}
                className={
                  msg.role === "user" ? "ml-12 bg-primary/5" : "mr-12"
                }
              >
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {msg.role === "user" ? "You" : "Claude"}
                  </p>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                </CardContent>
              </Card>
            ))}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex gap-2">
          <Textarea
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-h-[44px] max-h-[120px] resize-none"
            rows={1}
            disabled={streaming}
          />
          {streaming ? (
            <Button variant="destructive" size="icon" onClick={handleAbort}>
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={handleSend} disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
