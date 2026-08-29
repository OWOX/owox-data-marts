import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModelCanvasToolbar } from './ModelCanvasToolbar';

function renderToolbar(actions?: ReactNode) {
  return render(
    <ModelCanvasToolbar
      actions={actions}
      status='published'
      onStatusChange={vi.fn()}
      rel='connected'
      onRelChange={vi.fn()}
      searchQuery=''
      onSearchChange={vi.fn()}
      onExport={vi.fn()}
    />
  );
}

describe('ModelCanvasToolbar', () => {
  it('labels its select filters', () => {
    renderToolbar();

    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Relationships' })).toBeInTheDocument();
  });

  it('renders the actions slot within the row, ahead of the download button', () => {
    const { container } = renderToolbar(<button type='button'>Actions</button>);

    const row = container.firstElementChild;
    const actionsButton = screen.getByRole('button', { name: 'Actions' });
    const downloadButton = screen.getByTestId('export-canvas');

    expect(row).toContainElement(actionsButton);
    expect(
      actionsButton.compareDocumentPosition(downloadButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('keeps the controls on one row and constrains the search width', () => {
    const { container } = renderToolbar();

    expect(container.firstElementChild).toHaveClass('flex-nowrap');
    expect(container.firstElementChild).not.toHaveClass('flex-wrap');

    const searchInput = screen.getByRole('textbox', { name: 'Search Data Marts' });
    expect(searchInput.parentElement?.parentElement).toHaveClass(
      'max-w-[240px]',
      'min-w-[180px]',
      'shrink',
      '[&>div]:w-full'
    );
  });
});
