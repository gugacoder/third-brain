export function createSSE(
  url: string,
  eventName: string,
  onEvent: (data: unknown) => void,
  onError?: () => void,
): () => void {
  const es = new EventSource(url);

  es.addEventListener(eventName, (e: MessageEvent) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      // Ignore parse errors
    }
  });

  es.addEventListener("error", () => {
    onError?.();
  });

  return () => es.close();
}
