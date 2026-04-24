// Keep this list in sync with `AGGREGATE_FUNCTIONS` on the web side
// (`apps/web/src/features/data-marts/shared/types/relationship.types.ts`).
export const AGGREGATE_FUNCTIONS = [
  'STRING_AGG',
  'MAX',
  'MIN',
  'SUM',
  'COUNT',
  'COUNT_DISTINCT',
  'ANY_VALUE',
] as const;
export type AggregateFunction = (typeof AGGREGATE_FUNCTIONS)[number];
