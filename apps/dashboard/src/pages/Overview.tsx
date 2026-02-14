import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export function Overview() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      setHealth(await api.health());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 5000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <div className="text-destructive">
        <p>Failed to load health data: {error}</p>
      </div>
    );
  }

  if (!health) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Uptime */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Uptime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatUptime(health.uptime)}</p>
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Memory
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health.memory ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold">{health.memory.chunks}</p>
                <p className="text-xs text-muted-foreground">
                  chunks across {health.memory.files} files ({health.memory.provider})
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Unavailable</p>
            )}
          </CardContent>
        </Card>

        {/* Heartbeat */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Heartbeat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge
              status={health.heartbeat.running ? "ok" : "idle"}
              label={health.heartbeat.running ? "Running" : "Stopped"}
            />
            {health.heartbeat.lastEvent && (
              <p className="text-xs text-muted-foreground mt-1">
                Last: {health.heartbeat.lastEvent.status}
                {health.heartbeat.lastEvent.durationMs != null &&
                  ` (${health.heartbeat.lastEvent.durationMs}ms)`}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Started At */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Started At
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-mono">
              {new Date(health.startedAt).toLocaleTimeString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(health.startedAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
