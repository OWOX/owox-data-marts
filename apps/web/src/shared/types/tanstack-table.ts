import type { RowData } from '@tanstack/react-table';

/**
 * What a column may say about itself beyond what TanStack already models, for every table in the
 * app. TanStack leaves `ColumnMeta` empty on purpose and asks each app to declare its own shape
 * here, once; a column definition then carries it as `meta` and a table reads it back with types
 * intact.
 */
declare module '@tanstack/react-table' {
  // The augmented interface must repeat the library's own type parameters, used or not.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** The column's name in the column-visibility menu, where the header itself may be an icon. */
    title?: string;
    /** Whether a sortable header also prints `title`; off for a column that is only an icon. */
    showHeaderTitle?: boolean;
    /** The column starts hidden, until the analyst turns it on in the column-visibility menu. */
    hidden?: boolean;
    /**
     * The column holds prose that folds to its width, keeping the author's own line breaks. Every
     * other column holds a name, a type or a control and stays on one line: a schema table lays a
     * cell's text out with `white-space: pre` unless its column says otherwise.
     */
    wrap?: boolean;
  }
}
