/**
 * How long a Data Mart's output schema is considered fresh before AI flows
 * re-actualize it against the warehouse. Shared by the AI Insights prefetch
 * path and the AI metadata helper so both react to upstream schema changes
 * (drops, renames, additions) within the same window.
 */
export const AI_INSIGHTS_SCHEMA_EXPIRES_AFTER_MS = 30 * 60 * 1000;
