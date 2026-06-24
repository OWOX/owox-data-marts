export interface KeywordSlotWeights {
  title: number;
  context: number;
  field: number;
  description: number;
}

export interface ScoringConfig {
  keywordSlotWeights: KeywordSlotWeights;
  vecBlendWeight: number;
  kwBlendWeight: number;
  extendabilityScale: number;
  maxKeywordScore: number;
}

export const DATA_MART_SCORING_CONFIG: ScoringConfig = {
  keywordSlotWeights: {
    title: 1.0,
    context: 0.6,
    field: 0.8,
    description: 0.3,
  },
  vecBlendWeight: 0.65,
  kwBlendWeight: 0.35,
  extendabilityScale: 10,
  maxKeywordScore: 100,
};
