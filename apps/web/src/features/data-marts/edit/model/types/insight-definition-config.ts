export interface InsightDefinitionConfig {
  insight: InsightConfig;
}

export interface InsightConfig {
  title: string;
  template?: string | null;
}
