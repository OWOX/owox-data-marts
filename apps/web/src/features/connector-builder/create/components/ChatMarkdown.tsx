import { Fragment, type ReactNode } from 'react';

/**
 * Minimal, dependency-free Markdown renderer for AI chat bubbles. Supports the
 * subset models actually emit in chat: paragraphs with soft line breaks,
 * **bold**, `inline code`, headings (#…), and ordered/unordered lists where
 * each item may carry follow-up description lines.
 *
 * It builds React nodes directly (no dangerouslySetInnerHTML), so the model's
 * output can never inject HTML. Anything it does not recognise is rendered as
 * plain text, so the worst case is unstyled — never broken or unsafe.
 */

const BOLD_OR_CODE = /(\*\*[^*]+\*\*|`[^`]+`)/g;
const UNORDERED = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+\.\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

/** A GFM table separator row, e.g. `|---|:--:|`. Contains a pipe and a dash and only `|:- ` chars. */
function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return t.includes('|') && t.includes('-') && /^[\s|:-]+$/.test(t);
}

/** Split a `| a | b |` table row into trimmed cells. */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(cell => cell.trim());
}

/** Render the inline span of one line: **bold** and `code`, everything else text. */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(BOLD_OR_CODE).filter(part => part !== '');
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className='bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]'>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Render several lines as a soft-wrapped block (single newlines → <br>). */
function renderLines(lines: string[]): ReactNode[] {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderInline(line)}
    </Fragment>
  ));
}

const isOrdered = (l: string) => ORDERED.test(l);
const isUnordered = (l: string) => UNORDERED.test(l);
const isMarker = (l: string) => isOrdered(l) || isUnordered(l);

/** Parse a constrained Markdown subset into block-level React nodes. */
export function ChatMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const heading = HEADING.exec(line);

    if (heading) {
      blocks.push(
        <p key={blocks.length} className='text-foreground font-semibold'>
          {renderInline(heading[1])}
        </p>
      );
      i++;
      continue;
    }

    // Table: a header row followed by a `|---|---|` separator, then data rows.
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2; // consume header + separator
      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        lines[i].includes('|') &&
        !isTableSeparator(lines[i])
      ) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push(
        <div key={blocks.length} className='overflow-x-auto'>
          <table className='w-full border-collapse text-xs'>
            <thead>
              <tr>
                {header.map((cell, c) => (
                  <th key={c} className='border px-2 py-1 text-left font-medium'>
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {header.map((_, c) => (
                    <td key={c} className='border px-2 py-1 align-top'>
                      {renderInline(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (isMarker(line)) {
      // Collect one whole list. Models often number every item "1." and put a
      // description paragraph between items; we keep those descriptions with
      // their item and render ONE <ol>/<ul> so it numbers 1, 2, 3… correctly.
      const ordered = isOrdered(line);
      const items: { text: string; cont: string[] }[] = [];
      while (i < lines.length) {
        const sameType = ordered ? isOrdered(lines[i]) : isUnordered(lines[i]);
        if (!sameType) break;
        const match = (ordered ? ORDERED : UNORDERED).exec(lines[i]);
        if (!match) break;
        const item = { text: match[1], cont: [] as string[] };
        i++;
        while (i < lines.length && !isMarker(lines[i]) && !HEADING.test(lines[i])) {
          const trimmed = lines[i].replace(/^\s+/, '');
          if (trimmed !== '') item.cont.push(trimmed);
          i++;
        }
        items.push(item);
      }
      const lis = items.map((it, idx) => (
        <li key={idx}>
          {renderInline(it.text)}
          {it.cont.length > 0 && (
            <span className='text-muted-foreground mt-0.5 block'>{renderLines(it.cont)}</span>
          )}
        </li>
      ));
      blocks.push(
        ordered ? (
          <ol key={blocks.length} className='list-decimal space-y-1 pl-5'>
            {lis}
          </ol>
        ) : (
          <ul key={blocks.length} className='list-disc space-y-1 pl-5'>
            {lis}
          </ul>
        )
      );
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph: consecutive non-blank, non-marker, non-heading lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isMarker(lines[i]) &&
      !HEADING.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={blocks.length} className='whitespace-pre-wrap'>
        {renderLines(para)}
      </p>
    );
  }

  return <div className='space-y-2 text-sm leading-relaxed'>{blocks}</div>;
}
