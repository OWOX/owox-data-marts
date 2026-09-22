import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DataMartPreviewPanel } from './DataMartPreviewPanel';
import type { PreviewDataMartResponseDto } from '../../../shared/types/api';

vi.mock('@owox/ui/components/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='popover-content'>{children}</div>
  ),
}));

const previewDataMart = vi.fn();
vi.mock('../../../shared/services/data-mart.service', () => ({
  dataMartService: {
    previewDataMart: (...args: unknown[]) => previewDataMart(...args) as unknown,
  },
}));

const response = (rowCount: number): PreviewDataMartResponseDto => ({
  runId: 'run-1',
  columns: [
    { name: 'id', type: 'INTEGER' },
    { name: 'country', type: 'STRING' },
  ],
  rows: Array.from({ length: rowCount }, (_, i) => [i + 1, i % 2 ? 'US' : 'UA']),
  rowCount,
  limit: rowCount,
  truncated: false,
});

const runImmediately = (action: () => void | Promise<void>) => {
  void action();
};

describe('DataMartPreviewPanel', () => {
  beforeEach(() => {
    previewDataMart.mockReset();
  });

  it('runs the first preview with the default limit and shows the rows', async () => {
    previewDataMart.mockResolvedValue(response(2));
    render(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={1} runGuarded={runImmediately} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));

    expect(await screen.findByText('(2 rows)')).toBeInTheDocument();
    expect(previewDataMart).toHaveBeenCalledWith('dm1', { limit: 10 }, expect.any(AbortSignal));
  });

  it('disables the button and explains why when preview cannot run', () => {
    render(
      <DataMartPreviewPanel
        dataMartId='dm1'
        savedSchemaVersion={1}
        disabledReason='Refresh the schema to preview data.'
        runGuarded={runImmediately}
      />
    );

    expect(screen.getByRole('button', { name: 'Preview data' })).toBeDisabled();
    expect(screen.getByText('Refresh the schema to preview data.')).toBeInTheDocument();
  });

  it('re-queries the warehouse with the new limit on Update', async () => {
    previewDataMart.mockResolvedValue(response(2));
    render(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={1} runGuarded={runImmediately} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
    await screen.findByText('(2 rows)');

    fireEvent.change(screen.getByLabelText('Limit'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(previewDataMart).toHaveBeenLastCalledWith(
        'dm1',
        { limit: 30 },
        expect.any(AbortSignal)
      );
    });
  });

  it('keeps a filter being typed when the parent re-renders, then applies it as a WHERE filter', async () => {
    previewDataMart.mockResolvedValue(response(2));
    const { rerender } = render(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={1} runGuarded={runImmediately} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
    await screen.findByText('(2 rows)');

    const countryPopover = screen
      .getAllByTestId('popover-content')
      .find(el => el.textContent.includes('Filter · country'));
    if (!countryPopover) throw new Error('country filter popover not rendered');
    const valueInput = countryPopover.querySelector('input[type="text"]');
    if (!valueInput) throw new Error('value input not rendered');
    fireEvent.change(valueInput, { target: { value: 'US' } });

    // A parent re-render hands a new callback identity; the headers must not remount.
    rerender(
      <DataMartPreviewPanel
        dataMartId='dm1'
        savedSchemaVersion={1}
        runGuarded={action => {
          void action();
        }}
      />
    );

    const applyButton = Array.from(countryPopover.querySelectorAll('button')).find(
      b => b.textContent === 'Apply'
    );
    if (!applyButton) throw new Error('Apply button not rendered');
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(previewDataMart).toHaveBeenLastCalledWith(
        'dm1',
        { limit: 10, filters: [{ column: 'country', operator: 'eq', value: 'US' }] },
        expect.any(AbortSignal)
      );
    });
    expect(await screen.findByText('1 filter')).toBeInTheDocument();
  });

  it('shows the server error message', async () => {
    previewDataMart.mockRejectedValue({
      response: { data: { message: 'The data warehouse could not run the preview query: boom' } },
    });
    render(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={1} runGuarded={runImmediately} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The data warehouse could not run the preview query: boom'
    );
  });
});
