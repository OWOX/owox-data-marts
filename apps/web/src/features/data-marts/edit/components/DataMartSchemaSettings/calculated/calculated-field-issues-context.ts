import { createContext, useContext } from 'react';

/** Field name → the names its formula can no longer resolve. A metric with no entry is fine. */
export type CalculatedFieldIssues = ReadonlyMap<string, readonly string[]>;

const NONE: CalculatedFieldIssues = new Map();

/**
 * Which calculated fields the backend found broken, published by
 * `DataMartSchemaSettings` from the shared blendable-schema query and read by the table that draws
 * the status column.
 *
 * Context rather than a prop for the same reason as `JoinedFormulaFieldsContext`: the only path
 * between those two components runs through `SchemaContent` and the five per-storage tables, none
 * of which has any interest in the verdict.
 *
 * Empty outside a provider (a read-only table, a table test) — the same fail-open default the wire
 * has, where a metric with no entry is a metric with nothing wrong with it.
 */
export const CalculatedFieldIssuesContext = createContext<CalculatedFieldIssues>(NONE);

export const useCalculatedFieldIssues = (): CalculatedFieldIssues =>
  useContext(CalculatedFieldIssuesContext);
