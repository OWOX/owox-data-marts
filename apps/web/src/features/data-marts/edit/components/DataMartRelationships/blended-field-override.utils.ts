import type { BlendedFieldOverride } from '../../../shared/types/relationship.types';

/**
 * Strip a merged field override down to the values worth persisting.
 *
 * `postJoinAggregations` is deliberately kept even when it is an empty array: an
 * explicit `[]` means the analyst cleared every post-join function ("none allowed"),
 * which is a distinct state from "unset" (no key → falls back to the type-derived
 * default). `alias`/`isHidden`/`aggregateFunction` keep their existing omit rules.
 */
export function cleanBlendedFieldOverride(merged: BlendedFieldOverride): BlendedFieldOverride {
  const clean: BlendedFieldOverride = {};
  if (merged.alias !== undefined && merged.alias !== '') clean.alias = merged.alias;
  if (merged.isHidden !== undefined) clean.isHidden = merged.isHidden;
  if (merged.aggregateFunction !== undefined) clean.aggregateFunction = merged.aggregateFunction;
  if (merged.postJoinAggregations !== undefined) {
    clean.postJoinAggregations = merged.postJoinAggregations;
  }
  return clean;
}
