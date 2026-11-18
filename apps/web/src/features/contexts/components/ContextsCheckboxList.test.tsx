import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContextDto } from '../types/context.types';
import { ContextsCheckboxList } from './ContextsCheckboxList';

function renderList(name: string, description: string | null) {
  const context: ContextDto = {
    id: 'c1',
    name,
    description,
    icon: null,
    createdById: null,
    createdByUser: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
  };
  render(
    <ContextsCheckboxList idPrefix='t' contexts={[context]} selectedIds={[]} onToggle={vi.fn()} />
  );
}

describe('ContextsCheckboxList', () => {
  it('shows a Markdown description as plain text', () => {
    renderList('Finance', '## Mission\n**Owner:** [ARR](https://x.test)');
    expect(screen.getByText('Mission: Owner: ARR')).toBeInTheDocument();
    expect(screen.queryByText(/##|\*\*|\]\(/)).toBeNull();
  });

  it('hides the description when nothing is left', () => {
    renderList('HR', '---');
    expect(screen.getByText('HR').closest('label')?.textContent).toBe('HR');
  });

  it('renders a context with a null description', () => {
    renderList('Ops', null);
    expect(screen.getByText('Ops').closest('label')?.textContent).toBe('Ops');
  });

  it('keeps the name on one line and lets the description give way first', () => {
    renderList('Customer Success', 'Retain and grow revenue');
    const name = screen.getByText('Customer Success');
    expect(name).toHaveClass('truncate', 'py-1', '-my-1');
    expect(name.closest('label')).toHaveClass('min-w-0');
    expect(screen.getByText('Retain and grow revenue')).toHaveClass(
      'min-w-0',
      'flex-1',
      'truncate',
      'py-1',
      '-my-1'
    );
  });

  it('shows the full name and description on hover', () => {
    renderList('Customer Success', '## Mission\nRetain revenue');
    expect(screen.getByText('Customer Success')).toHaveAttribute('title', 'Customer Success');
    expect(screen.getByText('Mission: Retain revenue')).toHaveAttribute(
      'title',
      'Mission: Retain revenue'
    );
  });
});
