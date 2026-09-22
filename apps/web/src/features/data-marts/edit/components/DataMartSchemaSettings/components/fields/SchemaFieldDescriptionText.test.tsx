import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchemaFieldDescriptionText } from './SchemaFieldDescriptionText';

/**
 * How wide and how tall a description gets to be. Wrapping itself is the column's doing — the
 * Description column is declared `wrap` and the table lays it out with `white-space: pre-wrap`,
 * pinned in `BaseSchemaTable.test.tsx`. The classes are the contract here, since happy-dom lays
 * nothing out.
 */
describe('SchemaFieldDescriptionText', () => {
  const twoLines = 'Details regarding the origin of the session.\nSTRING: source, medium, campaign';

  it('is bounded on both sides, so it neither runs the table wide nor collapses to a word', () => {
    render(<SchemaFieldDescriptionText value={twoLines} onValueChange={vi.fn()} />);

    const cell = screen.getByRole('button');
    expect(cell).toHaveClass('max-w-[520px]');
    expect(cell).toHaveClass('min-w-[240px]');
    // The cell's own floor must win over EditableText's default 100px one.
    expect(cell).not.toHaveClass('min-w-[100px]');
    // A token with no break in it — a URL, a snake_case path — folds instead of spilling over.
    expect(cell).toHaveClass('break-words');
    expect(cell).toHaveTextContent(twoLines.replace('\n', ' '));
  });

  it('is clamped in height, so one long description cannot push the schema off the screen', () => {
    render(<SchemaFieldDescriptionText value={twoLines} onValueChange={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveClass('line-clamp-8');
  });

  it('claims no floor for an empty description, so an undescribed schema stays as wide as before', () => {
    render(<SchemaFieldDescriptionText value='' onValueChange={vi.fn()} />);

    const cell = screen.getByRole('button');
    expect(cell).toHaveTextContent('-');
    expect(cell).not.toHaveClass('min-w-[240px]');
    expect(cell).toHaveClass('min-w-[100px]');
  });

  it('opens its editor at the same measure the cell wraps at', () => {
    render(<SchemaFieldDescriptionText value={twoLines} onValueChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button'));

    const editor = screen.getByRole('textbox');
    expect(editor).toHaveValue(twoLines);
    expect(editor.closest('[data-slot="popover-content"]')).toHaveClass('w-[520px]');
  });
});
