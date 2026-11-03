import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataMartStatus } from '../../enums';
import { dataMartService } from '../../services/data-mart.service';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render a canvas export item — that lives in its own toolbar button', () => {
    renderBulkActions();
    expect(screen.queryByTestId('export-canvas')).not.toBeInTheDocument();
  });

  it('holds Delete until it is known which Data Marts reference the selection', async () => {
    let answer: (impact: unknown) => void = () => {};
    vi.spyOn(dataMartService, 'getInputSourceChangeImpact').mockReturnValue(
      new Promise(resolve => {
        answer = resolve;
      }) as never
    );
    renderBulkActions();

    fireEvent.click(screen.getByRole('button', { name: /Delete 1 Data Mart/ }));

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(
      screen.getByText('Checking which Data Marts reference this one in their SQL…')
    ).toBeInTheDocument();

    await act(async () => {
      answer({
        outboundRelationshipsCount: 0,
        inboundRelationshipsCount: 0,
        reportsCount: 0,
        referencingDataMartsCount: 1,
        referencingDataMarts: [{ id: 'retail-orders', title: 'Retail orders' }],
      });
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(screen.getByText('Retail orders')).toBeInTheDocument();
  });
});
