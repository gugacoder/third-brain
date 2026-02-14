import { useState, useEffect, useRef, useCallback } from "react";

export function useSSE<T = unknown>(url: string, eventName: string) {
  const [events, setEvents] = useState<T[]>([]);
  const [lastEvent, setLastEvent] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("open", () => setConnected(true));

    es.addEventListener(eventName, (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as T;
        setLastEvent(data);
        setEvents((prev) => [...prev, data]);
      } catch {
        // Ignore parse errors
      }
    });

    es.addEventListener("error", () => {
      setConnected(false);
    });

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [url, eventName]);

  const clear = useCallback(() => setEvents([]), []);

  return { events, lastEvent, connected, clear };
}
