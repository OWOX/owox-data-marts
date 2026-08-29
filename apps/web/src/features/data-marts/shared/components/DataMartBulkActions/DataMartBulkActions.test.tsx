import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataMartStatus } from '../../enums';
import { DataMartBulkActions } from './DataMartBulkActions';

// Radix dropdowns need real pointer events — render everything inline instead
// (the established pattern for menu tests in this codebase).
vi.mock('@owox/ui/components/dropdown-menu', () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    DropdownMenu: passthrough,
    DropdownMenuTrigger: passthrough,
    DropdownMenuContent: passthrough,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({
      children,
      onSelect,
      ...props
    }: {
      children?: ReactNode;
      onSelect?: () => void;
      'data-testid'?: string;
    }) => (
      <button type='button' data-testid={props['data-testid']} onClick={onSelect}>
        {children}
      </button>
    ),
  };
});

function renderBulkActions() {
  return render(
    <DataMartBulkActions
      dataMarts={[{ id: 'mart-1', status: DataMartStatus.PUBLISHED }]}
      projectId='project-1'
      deleteDataMart={vi.fn()}
      publishDataMart={vi.fn()}
      onCompleted={vi.fn()}
      targetScope='canvas'
    />
  );
}

describe('DataMartBulkActions', () => {
  it('does not render a canvas export item — that lives in its own toolbar button', () => {
    renderBulkActions();
    expect(screen.queryByTestId('export-canvas')).not.toBeInTheDocument();
  });
});
