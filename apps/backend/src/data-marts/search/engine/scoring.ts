import type { EntityScoringDescriptor } from '../indexing/entity-scoring-descriptor';
import type { ScoringConfig } from './scoring-config';
import { tokenize, matchesAny } from './tokenizer';

export function computeExtendability(fieldCount: number, config: ScoringConfig): number {
  return Math.round(Math.log2(fieldCount + 1) * config.extendabilityScale);
}

export function scoreEntity(
  descriptor: EntityScoringDescriptor,
  promptTokens: string[],
  config: ScoringConfig
): number {
  if (promptTokens.length === 0) return 0;

  const titleTokens = new Set<string>();
  const contextTokens = new Set<string>();
  const descTokens = new Set<string>();

  for (const slot of descriptor.richTextSlots) {
    const tokens = tokenize(slot.text);
    if (slot.kind === 'title') {
      for (const t of tokens) titleTokens.add(t);
    } else if (slot.kind === 'context') {
      for (const t of tokens) contextTokens.add(t);
    } else if (slot.kind === 'description') {
      for (const t of tokens) descTokens.add(t);
    }
  }

  const fieldTokens = new Set<string>();
  for (const slot of descriptor.atomicTokenSlots) {
    for (const t of tokenize(slot.text)) fieldTokens.add(t);
  }

  const w = config.keywordSlotWeights;
  let totalCredit = 0;
  for (const token of promptTokens) {
    totalCredit += Math.max(
      matchesAny(token, titleTokens) ? w.title : 0,
      matchesAny(token, contextTokens) ? w.context : 0,
      matchesAny(token, fieldTokens) ? w.field : 0,
      matchesAny(token, descTokens) ? w.description : 0
    );
  }

  return Math.min(config.maxKeywordScore, Math.round((totalCredit / promptTokens.length) * 100));
}
