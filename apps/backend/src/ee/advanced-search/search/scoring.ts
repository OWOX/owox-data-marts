import type { SearchableDataMart, RelationshipEdge } from '../catalog/data-mart-catalog.port';
import { tokenize, matchesAny } from './tokenizer';
import { cosineSim } from '../embedding/vector-codec';

export interface IndexedVector {
  dataMartId: string;
  vector: Float32Array | null;
}

export interface ScoredDataMart {
  dataMartId: string;
  title: string;
  description: string | null;
  finalScore: number;
  kwScore: number;
  vecScore: number | null;
  extendability: number;
}

function scoreDataMart(mart: SearchableDataMart, promptTokens: string[]): number {
  if (promptTokens.length === 0) return 0;

  const titleTokens = tokenize(mart.title);
  const descTokens = mart.description ? tokenize(mart.description) : new Set<string>();

  const contextTokens = new Set<string>();
  for (const ctx of mart.contexts) {
    for (const t of tokenize(ctx.name)) contextTokens.add(t);
    for (const t of tokenize(ctx.content)) contextTokens.add(t);
  }

  const fieldTokens = new Set<string>();
  for (const fieldName of mart.fieldNames) {
    for (const t of tokenize(fieldName)) fieldTokens.add(t);
  }

  let totalCredit = 0;
  for (const token of promptTokens) {
    if (matchesAny(token, titleTokens)) totalCredit += 1.0;
    else if (matchesAny(token, contextTokens)) totalCredit += 0.6;
    else if (matchesAny(token, fieldTokens)) totalCredit += 0.8;
    else if (matchesAny(token, descTokens)) totalCredit += 0.3;
  }

  return Math.min(100, Math.round((totalCredit / promptTokens.length) * 100));
}

function outboundFieldCount(
  mart: SearchableDataMart,
  edges: RelationshipEdge[],
  martsById: Map<string, SearchableDataMart>
): number {
  let count = mart.fieldNames.length;
  for (const edge of edges) {
    if (edge.sourceDataMartId === mart.id) {
      const target = martsById.get(edge.targetDataMartId);
      if (target) count += target.fieldNames.length;
    }
  }
  return count;
}

export function rank(
  marts: SearchableDataMart[],
  edges: RelationshipEdge[],
  index: IndexedVector[],
  prompt: string,
  promptVec: Float32Array | null
): ScoredDataMart[] {
  const promptTokens = Array.from(tokenize(prompt));
  const martsById = new Map(marts.map(m => [m.id, m]));
  const vectorById = new Map(index.map(v => [v.dataMartId, v.vector]));

  const scored = marts.map(mart => {
    const kwScore = scoreDataMart(mart, promptTokens);

    const martVec = vectorById.get(mart.id) ?? null;
    let vecScore: number | null = null;
    let keywordsSimilarity = kwScore;

    if (promptVec !== null && martVec !== null) {
      const sim = cosineSim(promptVec, martVec);
      vecScore = Math.round(sim * 100);
      keywordsSimilarity = Math.round(vecScore * 0.65 + kwScore * 0.35);
    }

    const totalFields = outboundFieldCount(mart, edges, martsById);
    const extendability = Math.round(Math.log2(totalFields + 1) * 10);

    return {
      dataMartId: mart.id,
      title: mart.title,
      description: mart.description,
      finalScore: keywordsSimilarity + extendability,
      kwScore,
      vecScore,
      extendability,
    };
  });

  return scored.sort((a, b) => b.finalScore - a.finalScore);
}
