import { render } from '@testing-library/react';
import type { CellContext } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import { getContextsColumns, type ContextsTableItem } from './columns';

function renderDescriptionCell(description: string | null) {
  const column = getContextsColumns().find(
    c => 'accessorKey' in c && c.accessorKey === 'description'
  );
  const cell = column?.cell as (
    context: CellContext<ContextsTableItem, unknown>
  ) => React.ReactNode;
  const row = { original: { description } };
  return render(<>{cell({ row } as unknown as CellContext<ContextsTableItem, unknown>)}</>);
}

describe('Contexts description column', () => {
  it('shows a Markdown description as plain text', () => {
    const { container } = renderDescriptionCell('## Goals\n**Owner:** Finance');
    expect(container.textContent).toBe('Goals: Owner: Finance');
  });

  it.each([null, '', '---'])('shows a dash for %j', description => {
    const { container } = renderDescriptionCell(description);
    expect(container.textContent).toBe('—');
  });
});
