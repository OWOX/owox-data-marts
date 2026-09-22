import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchemaFieldDescriptionText } from './SchemaFieldDescriptionText';

/**
 * The schema table sets `white-space: pre` inline on every cell, which is right for a name or a
 * type and wrong for prose: a long description then never wrapped, the Description column grew to
 * its longest line and the table had to be scrolled sideways to read any of it. These pin what the
 * description cell does about that — the classes are the contract, since happy-dom lays nothing out.
 */
describe('SchemaFieldDescriptionText', () => {
  const twoLines = 'Details regarding the origin of the session.\nSTRING: source, medium, campaign';

  it('wraps the text while keeping the author’s own line breaks', () => {
    render(<SchemaFieldDescriptionText value={twoLines} onValueChange={vi.fn()} />);

    const cell = screen.getByRole('button');
    // `pre-wrap`, not `normal`: the AI generator writes one line per type group of a nested
    // record, and folding those into one paragraph loses the structure the analyst reads.
    expect(cell).toHaveClass('whitespace-pre-wrap');
    // A token with no break in it — a URL, a snake_case path — must not hold the column open.
    expect(cell).toHaveClass('break-words');
    expect(cell).toHaveTextContent(twoLines.replace('\n', ' '));
  });

  it('is bounded on both sides, so it neither runs the table wide nor collapses to a word', () => {
    render(<SchemaFieldDescriptionText value={twoLines} onValueChange={vi.fn()} />);

    const cell = screen.getByRole('button');
    expect(cell).toHaveClass('max-w-[520px]');
    expect(cell).toHaveClass('min-w-[240px]');
    // The cell's own floor must win over EditableText's default 100px one.
    expect(cell).not.toHaveClass('min-w-[100px]');
  });

  it('opens its editor at the same measure the cell wraps at', () => {
    render(<SchemaFieldDescriptionText value={twoLines} onValueChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button'));

    const editor = screen.getByRole('textbox');
    expect(editor).toHaveValue(twoLines);
    expect(editor.closest('[data-slot="popover-content"]')).toHaveClass('w-[520px]');
  });

  it('shows the placeholder for an empty description', () => {
    render(<SchemaFieldDescriptionText value='' onValueChange={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveTextContent('-');
  });
});
