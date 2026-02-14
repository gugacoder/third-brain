import { useFetch } from "@/hooks/useApi";
import { api } from "@/lib/api";
import type { SkillInfo } from "@/lib/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function Skills() {
  const {
    data,
    loading,
    refetch,
  } = useFetch<{ skills: SkillInfo[] }>(api.skills);

  const skills = data?.skills ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Skills</h2>
        <Button variant="outline" size="sm" onClick={refetch}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading...</p>}

      {skills.length === 0 && !loading && (
        <p className="text-muted-foreground text-sm">
          No skills found. Place SKILL.md files in ~/.third-brain/skills/ or
          skills/ in the workspace.
        </p>
      )}

      <div className="grid gap-4">
        {skills.map((skill) => (
          <Card key={skill.name}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{skill.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{skill.source}</Badge>
                  <Badge
                    variant={skill.eligible ? "default" : "secondary"}
                  >
                    {skill.eligible ? "Eligible" : "Ineligible"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {skill.description}
              </p>
              {skill.metadata?.requires && (
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  {skill.metadata.requires.bins &&
                    skill.metadata.requires.bins.length > 0 && (
                      <span>
                        Bins:{" "}
                        {skill.metadata.requires.bins.join(", ")}
                      </span>
                    )}
                  {skill.metadata.requires.env &&
                    skill.metadata.requires.env.length > 0 && (
                      <span>
                        Env:{" "}
                        {skill.metadata.requires.env.join(", ")}
                      </span>
                    )}
                </div>
              )}
              {skill.metadata?.os && (
                <p className="text-xs text-muted-foreground mt-1">
                  OS: {skill.metadata.os.join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
