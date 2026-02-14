export type SkillSource = "managed" | "workspace";

export type SkillRequirements = {
  bins?: string[];
  env?: string[];
};

export type SkillMetadata = {
  always?: boolean;
  primaryEnv?: string;
  os?: string[];
  requires?: SkillRequirements;
};

export type Skill = {
  name: string;
  description: string;
  body: string;
  source: SkillSource;
  dir: string;
  metadata?: SkillMetadata;
};

export type SkillConfig = {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
};

export type SkillsSnapshot = {
  skills: Skill[];
  prompt: string;
};
