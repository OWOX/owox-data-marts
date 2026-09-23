import type { OutputConfig } from '../types/output-config';

/**
 * Records which columns the analyst took an aggregation off, so the server does not choose one
 * for them again: an empty `aggregationConfig` alone reads as "not decided yet" to auto-collapse.
 * Adding an aggregation back to a column withdraws its opt-out.
 */
export function withAutoAggregationOptOut(
  previous: OutputConfig,
  next: OutputConfig
): OutputConfig {
  const aggregatedNext = new Set(next.aggregationConfig.map(rule => rule.column));
  const removed = previous.aggregationConfig
    .map(rule => rule.column)
    .filter(column => !aggregatedNext.has(column));

  const stored = next.autoAggregationOptOut;
  const optOut = new Set(stored);
  for (const column of aggregatedNext) optOut.delete(column);
  for (const column of removed) optOut.add(column);

  if (sameMembers(optOut, stored ?? [])) return next;
  return { ...next, autoAggregationOptOut: [...optOut] };
}

/** A deselected column is no longer projected, so its opt-out has nothing left to protect. */
export function withoutAutoAggregationOptOutFor(
  config: OutputConfig,
  deselected: ReadonlySet<string>
): OutputConfig {
  const stored = config.autoAggregationOptOut ?? [];
  const kept = stored.filter(column => !deselected.has(column));
  return kept.length === stored.length ? config : { ...config, autoAggregationOptOut: kept };
}

function sameMembers(set: ReadonlySet<string>, list: readonly string[]): boolean {
  return set.size === list.length && list.every(column => set.has(column));
}
