import { useState } from "react";
import { api } from "@/lib/api";
import { useFetch } from "@/hooks/useApi";
import type { MemorySearchResult, MemoryStatus } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, RefreshCw } from "lucide-react";

export function Memory() {
  const { data: status, refetch: refreshStatus } = useFetch<MemoryStatus>(
    api.memory.status,
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await api.memory.search(query.trim());
      setResults(res.results);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearching(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.memory.sync();
      await refreshStatus();
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Memory</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync"}
        </Button>
      </div>

      {/* Status */}
      {status && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span>Provider: {status.provider}</span>
          <span>Files: {status.files}</span>
          <span>Chunks: {status.chunks}</span>
          {status.dirty && <Badge variant="secondary">Dirty</Badge>}
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          placeholder="Search memory..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={searching || !query.trim()}>
          <Search className="h-4 w-4 mr-2" />
          {searching ? "Searching..." : "Search"}
        </Button>
      </form>

      {/* Results */}
      {results.length > 0 && (
        <ScrollArea className="h-[500px]">
          <div className="space-y-3">
            {results.map((r, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-mono">
                      {r.citation || r.path}
                    </CardTitle>
                    <Badge variant="outline">
                      {(r.score * 100).toFixed(1)}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
                    {r.snippet}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {results.length === 0 && query && !searching && (
        <p className="text-muted-foreground text-sm">
          No results found for "{query}".
        </p>
      )}
    </div>
  );
}
