import { CHIP_CLASS_NAME } from './formula-chip-decorations';
import type { ResolvedReference } from './formula-authoring';

export interface FormulaChipsProps {
  /** The formula in AUTHORING form — plain field names, never a `{{ref}}` tag. */
  text: string;
  /** The resolved spans of `text`, half-open and in its own offsets. */
  references: readonly ResolvedReference[];
  /**
   * What a chip says on hover — which Data Mart a joined reference reads from. Omit and a chip is
   * paint alone, which is what a table with no reference index to look one up in can offer.
   */
  describeReference?: (reference: ResolvedReference) => string | undefined;
}

/**
 * The same pill the editor draws, outside the editor: a formula rendered as text with its resolved
 * references picked out, for the table row.
 *
 * Static by construction — nodes, no Monaco, no caret, no interception. Only the class is shared
 * with the editor (`CHIP_CLASS_NAME`, styled once in styles/App.css), so a field reads the same
 * whether or not the popover is open and there is one place to change how it looks.
 *
 * A reference whose span no longer holds its own text is skipped, the same guard
 * `chipDecorationsFor` applies. This one additionally sorts and drops an overlap, which the
 * decoration path leaves to Monaco; `resolveAll` claims its offsets so it emits neither, so that is
 * a property of rendering into a single stream of nodes rather than a difference in what is a chip.
 */
export function FormulaChips({ text, references, describeReference }: FormulaChipsProps) {
  const chips = references
    .filter(ref => ref.end > ref.start && text.slice(ref.start, ref.end) === ref.text)
    .sort((a, b) => a.start - b.start);

  const parts: { text: string; title?: string; isChip: boolean }[] = [];
  let cursor = 0;
  for (const chip of chips) {
    // Overlapping spans would double-render the overlap; the later one is dropped, not merged.
    if (chip.start < cursor) continue;
    if (chip.start > cursor) parts.push({ text: text.slice(cursor, chip.start), isChip: false });
    parts.push({ text: chip.text, title: describeReference?.(chip), isChip: true });
    cursor = chip.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), isChip: false });

  return (
    <>
      {parts.map((part, index) =>
        part.isChip ? (
          // Parts are positional and their text repeats; the index is the only stable key.
          // `title` overrides the whole formula the cell puts on an ancestor, which is what makes
          // a hover over the pill itself answer about the pill.
          <span key={index} className={CHIP_CLASS_NAME} title={part.title}>
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  );
}
