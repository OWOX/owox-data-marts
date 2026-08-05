import { fireEvent, render, screen } from '@testing-library/react';
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
    DropdownMenuPortal: passthrough,
    DropdownMenuSeparator: () => null,
    DropdownMenuSub: passthrough,
    DropdownMenuSubContent: passthrough,
    DropdownMenuSubTrigger: ({
      children,
      ...props
    }: {
      children?: ReactNode;
      'data-testid'?: string;
    }) => <div data-testid={props['data-testid']}>{children}</div>,
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

function renderBulkActions(onExport?: (format: string) => void) {
  return render(
    <DataMartBulkActions
      dataMarts={[{ id: 'mart-1', status: DataMartStatus.PUBLISHED }]}
      projectId='project-1'
      deleteDataMart={vi.fn()}
      publishDataMart={vi.fn()}
      onCompleted={vi.fn()}
      targetScope='canvas'
      onExport={onExport}
    />
  );
}

describe('DataMartBulkActions export submenu', () => {
  it('is absent when no export handler is provided', () => {
    renderBulkActions();
    expect(screen.queryByTestId('export-canvas')).not.toBeInTheDocument();
  });

  it('offers every canvas export format and reports the picked one', () => {
    const onExport = vi.fn();
    renderBulkActions(onExport);

    expect(screen.getByTestId('export-canvas')).toBeInTheDocument();
    expect(screen.getByText('Image (SVG)')).toBeInTheDocument();
    expect(screen.getByText('Image (PNG)')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('OKF (Markdown)')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('export-canvas-svg'));
    fireEvent.click(screen.getByTestId('export-canvas-okf'));
    expect(onExport.mock.calls.map(call => call[0])).toEqual(['svg', 'okf']);
  });
});
