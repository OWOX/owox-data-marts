import { createContext, useContext } from 'react';

/**
 * The Data Mart whose Output Schema is on screen, for the formula editor's live backend check —
 * the one thing that check cannot derive from the row it is editing.
 *
 * Context rather than a prop for the same reason as `JoinedFormulaFieldsContext`: the only path
 * from `DataMartSchemaSettings` to the cell runs through `SchemaContent` and the five per-storage
 * tables, none of which has any business knowing which Data Mart it is drawing, and a sixth
 * storage table could silently forget to forward one more optional prop.
 *
 * Empty outside a provider (a read-only table, a table test), which turns the live check off
 * rather than firing a request at `/data-marts//schema/validate-formula`. Nothing is lost by it:
 * the check never gated anything, and the save still runs the same rules.
 */
export const FormulaDataMartIdContext = createContext<string>('');

export const useFormulaDataMartId = (): string => useContext(FormulaDataMartIdContext);
