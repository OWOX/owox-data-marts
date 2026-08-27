import { createContext, useContext } from 'react';
import type { JoinedSchemaField } from './formula-reference-index';

/**
 * Whether the join tree behind `fields` is actually known.
 *
 * An empty `fields` is not self-explanatory: it means "this Data Mart joins nothing" when the
 * blendable schema arrived, and "we have no idea" when it has not. The editor refuses a name it
 * cannot resolve, so without this distinction a failed fetch would tell an analyst their correct
 * joined reference is not a field of this Data Mart — blaming them for our own failed request.
 */
export type JoinedFieldsStatus = 'ready' | 'loading' | 'unavailable';

export interface JoinedFormulaFields {
  fields: readonly JoinedSchemaField[];
  status: JoinedFieldsStatus;
}

/**
 * 'ready', not 'loading': outside the provider (a read-only table, a table test) nothing is in
 * flight and nothing failed — there simply is no join tree, so only own-Data-Mart
 * fields are offered.
 */
const NONE: JoinedFormulaFields = { fields: [], status: 'ready' };

/**
 * The joined Data Marts' fields a calculated field's formula editor offers in autocomplete,
 * published by `DataMartSchemaSettings` (which reads them from the shared blendable-schema query)
 * and read by the table that renders the formula cell.
 *
 * Context rather than a prop because the only path between those two components runs through
 * `SchemaContent` and the five per-storage tables, none of which has any interest in the join
 * tree — and an optional prop each of them merely forwards is one a sixth storage table could
 * silently forget, which would drop joined autocomplete there with nothing failing to say so.
 */
export const JoinedFormulaFieldsContext = createContext<JoinedFormulaFields>(NONE);

export const useJoinedFormulaFields = (): JoinedFormulaFields =>
  useContext(JoinedFormulaFieldsContext);
