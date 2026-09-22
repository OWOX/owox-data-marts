import { EditableText, type EditableTextAction } from '@owox/ui/components/common/editable-text';

/**
 * A description is at most 520px wide, in the cell and in its editor alike: the measure the
 * calculated field's formula editor and hover card already use, so a description wraps identically
 * wherever it is read. Spelled out in each class rather than interpolated — Tailwind only generates
 * the classes it can read verbatim from the source.
 *
 * And at least 240px. The table lays itself out automatically and every other column holds a
 * control of a fixed width, so whatever is left goes to this one — on a laptop with the sidebar
 * open that was the longest word of the text, and a four-line description ran twenty lines tall.
 * The floor keeps it readable; the table then overflows by that much on such a screen, as it
 * already did before any description was written, and the sticky Name and actions columns are
 * what make that overflow navigable.
 *
 * The cell's text. `whitespace-pre-wrap` overrides the `white-space: pre` the schema table sets
 * inline on every cell: `pre` kept the author's line breaks but never wrapped, so the Description
 * column grew to the longest line of the longest description and the whole table had to be
 * scrolled sideways to read it. `pre-wrap` keeps those line breaks — the AI generator writes one
 * per type group of a nested record — and folds anything longer than the measure.
 *
 * `break-words` is for the token with no break in it, a URL or a snake_case path, which would
 * otherwise hold the column open just as `pre` did.
 */
const TRIGGER_CLASSES = 'min-w-[240px] max-w-[520px] break-words whitespace-pre-wrap';

/**
 * The editor opens at the same measure the cell wraps at, instead of at a bare textarea's twenty
 * characters — a few sentences of description do not fit in that.
 */
const POPOVER_CLASSES = 'w-[520px]';

interface SchemaFieldDescriptionTextProps {
  value: string;
  onValueChange: (value: string) => void;
  /** The AI generate button in the editor; omitted where the helper cannot describe this field. */
  editorAction?: EditableTextAction;
}

/**
 * A schema field's Description cell: the wrapped text plus its popover editor. One component so
 * every schema table — BigQuery with its nested records, and the flat ones — reads the same way.
 */
export function SchemaFieldDescriptionText({
  value,
  onValueChange,
  editorAction,
}: SchemaFieldDescriptionTextProps) {
  return (
    <EditableText
      value={value}
      onValueChange={onValueChange}
      minRows={5}
      placeholder='-'
      className={TRIGGER_CLASSES}
      popoverClassName={POPOVER_CLASSES}
      editorAction={editorAction}
    />
  );
}
