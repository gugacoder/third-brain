import { useState } from "react";
import { api } from "@/lib/api";
import { useFetch } from "@/hooks/useApi";
import { useSSE } from "@/hooks/useSSE";
import type { HeartbeatStatus, HeartbeatEvent } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/StatusBadge";
import { Play, Square, Zap, Trash2 } from "lucide-react";

function statusToBadgeVariant(
  status: HeartbeatEvent["status"],
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "sent":
      return "default";
    case "ok-token":
      return "secondary";
    case "failed":
      return "destructive";
    case "skipped":
      return "outline";
  }
}

export function Heartbeat() {
  const {
    data: status,
    refetch: refreshStatus,
  } = useFetch<HeartbeatStatus>(api.heartbeat.status);
  const { events, connected, clear } = useSSE<HeartbeatEvent>(
    "/sse/heartbeat",
    "heartbeat",
  );
  const [acting, setActing] = useState(false);

  const handleStart = async () => {
    setActing(true);
    try {
      await api.heartbeat.start();
      await refreshStatus();
    } finally {
      setActing(false);
    }
  };

  const handleStop = async () => {
    setActing(true);
    try {
      await api.heartbeat.stop();
      await refreshStatus();
    } finally {
      setActing(false);
    }
  };

  const handleTrigger = async () => {
    setActing(true);
    try {
      await api.heartbeat.run();
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Heartbeat</h2>
        <div className="flex items-center gap-2">
          <StatusBadge
            status={connected ? "ok" : "error"}
            label={connected ? "SSE connected" : "SSE disconnected"}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {status?.running ? (
          <Button variant="destructive" size="sm" onClick={handleStop} disabled={acting}>
            <Square className="h-4 w-4 mr-2" />
            Stop
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={handleStart} disabled={acting}>
            <Play className="h-4 w-4 mr-2" />
            Start
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleTrigger} disabled={acting}>
          <Zap className="h-4 w-4 mr-2" />
          Trigger Now
        </Button>
        <Button variant="ghost" size="sm" onClick={clear}>
          <Trash2 className="h-4 w-4 mr-2" />
          Clear Log
        </Button>
      </div>

      {/* Status Card */}
      {status && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4 text-sm">
            <StatusBadge
              status={status.running ? "ok" : "idle"}
              label={status.running ? "Running" : "Stopped"}
            />
            {status.lastEvent && (
              <span className="text-muted-foreground">
                Last event: {status.lastEvent.status} at{" "}
                {new Date(status.lastEvent.ts).toLocaleTimeString()}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Event Log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Event Log ({events.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events yet. Waiting for heartbeat...
              </p>
            ) : (
              <div className="space-y-2">
                {[...events].reverse().map((evt, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-sm border-b pb-2 last:border-0"
                  >
                    <Badge variant={statusToBadgeVariant(evt.status)}>
                      {evt.status}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground">
                        {new Date(evt.ts).toLocaleTimeString()}
                      </span>
                      {evt.reason && (
                        <span className="text-xs text-muted-foreground ml-2">
                          ({evt.reason})
                        </span>
                      )}
                      {evt.durationMs != null && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {evt.durationMs}ms
                        </span>
                      )}
                      {evt.preview && (
                        <p className="text-xs mt-1 text-muted-foreground truncate">
                          {evt.preview}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
