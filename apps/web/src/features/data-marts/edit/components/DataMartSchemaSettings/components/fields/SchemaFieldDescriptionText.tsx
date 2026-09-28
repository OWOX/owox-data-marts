import { EditableText, type EditableTextAction } from '@owox/ui/components/common/editable-text';
import { cn } from '@owox/ui/lib/utils';

/**
 * The cell's text. Its column is declared `wrap` (`BaseSchemaTable`), so the table lays it out
 * with `white-space: pre-wrap` — the author's own line breaks kept, the AI generator writes one per
 * type group of a nested record, and anything longer folded. What this component adds is how wide
 * and how tall that fold gets to be.
 *
 * At most 520px wide, the measure the calculated field's formula editor and hover card already use,
 * so a description wraps identically wherever it is read. In an auto-laid-out table it is this cap
 * that bounds the column: a cell's width contribution is clamped by `max-width`, so even a token
 * with no break in it — a URL, a snake_case path — cannot hold the column open past 520px.
 * `break-words` then folds that token inside the box instead of letting it spill over the cells
 * beside it. Spelled out rather than interpolated — Tailwind only generates classes it can read
 * verbatim from the source.
 *
 * At most eight lines tall, so one long description does not push the rest of the schema off the
 * screen — the formula cell clamps for the same reason. A typical AI description of a nested record
 * (two sentences and a line per type group) fits; a longer one ends in an ellipsis and opens in
 * full on click, in the editor.
 */
const TRIGGER_CLASSES = 'line-clamp-8 max-w-[520px] break-words';

/**
 * And at least 240px wide once there is text to read. The table's other columns hold controls of
 * fixed width, so whatever is left goes to this one — on a laptop with the sidebar open that was
 * the longest word of the text, and a four-line description ran twenty lines tall. The floor keeps
 * it readable; the table then overflows by that much on such a screen, and the sticky Name and
 * actions columns are what make that overflow navigable.
 *
 * Only once there is text: a column of `-` placeholders keeps EditableText's own 100px, so a schema
 * with no descriptions at all is exactly as wide as it was before descriptions wrapped.
 */
const FILLED_TRIGGER_CLASSES = 'min-w-[240px]';

/**
 * The editor opens at the same measure the cell wraps at, instead of at a bare textarea's twenty
 * characters — a few sentences of description do not fit in that. EditableText itself caps the
 * popover to the viewport, so this is the width on a desktop, not on a phone.
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
      className={cn(TRIGGER_CLASSES, value && FILLED_TRIGGER_CLASSES)}
      popoverClassName={POPOVER_CLASSES}
      editorAction={editorAction}
    />
  );
}
