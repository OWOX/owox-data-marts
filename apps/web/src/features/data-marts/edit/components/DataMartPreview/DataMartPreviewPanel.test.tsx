import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DataMartPreviewPanel } from './DataMartPreviewPanel';
import type { PreviewDataMartResponseDto } from '../../../shared/types/api';
import type { DataMartSchema } from '../../../shared/types/data-mart-schema.types';
import { previewFilterTypesFromSchema } from './preview-filter-types';

vi.mock('@owox/ui/components/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='popover-content'>{children}</div>
  ),
}));

const trackEvent = vi.fn();
vi.mock('../../../../../utils/data-layer', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args) as unknown,
}));

const previewDataMart = vi.fn();
vi.mock('../../../shared/services/data-mart.service', () => ({
  dataMartService: {
    previewDataMart: (...args: unknown[]) => previewDataMart(...args) as unknown,
  },
}));

const response = (rowCount: number): PreviewDataMartResponseDto => ({
  columns: [
    { name: 'id', type: 'INTEGER' },
    { name: 'country', type: 'STRING' },
  ],
  rows: Array.from({ length: rowCount }, (_, i) => [i + 1, i % 2 ? 'US' : 'UA']),
  rowCount,
  limit: rowCount,
  truncated: false,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

const OUTDATED_NOTE = /The schema changed since this preview/;

const runImmediately = (action: () => void | Promise<void>) => {
  void action();
};

describe('DataMartPreviewPanel', () => {
  beforeEach(() => {
    previewDataMart.mockReset();
    trackEvent.mockReset();
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

  it('reports a successful preview to product analytics', async () => {
    previewDataMart.mockResolvedValue(response(2));
    render(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={1} runGuarded={runImmediately} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));

    await screen.findByText('(2 rows)');
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'data_mart_preview',
        category: 'DataMart',
        action: 'Preview',
        label: 'dm1',
        limit: 10,
        filterCount: 0,
        rowCount: 2,
        truncated: false,
      })
    );
  });

  it('reports a failed preview to product analytics', async () => {
    previewDataMart.mockRejectedValue({ response: { data: { message: 'boom' } } });
    render(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={1} runGuarded={runImmediately} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));

    await screen.findByRole('alert');
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'data_mart_error',
        action: 'PreviewError',
        label: 'dm1',
        error: 'boom',
      })
    );
  });

  it('does not report a cancelled preview', async () => {
    previewDataMart.mockImplementation(
      (_id: string, _body: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('canceled'), { name: 'CanceledError' }));
          });
        })
    );
    render(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={1} runGuarded={runImmediately} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Preview data' })).toBeEnabled();
    });
    expect(trackEvent).not.toHaveBeenCalled();
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

  it('does not flag a preview run behind Save & continue as outdated', async () => {
    previewDataMart.mockResolvedValue(response(2));
    // The guard holds the action while the dialog saves the edits, then runs it.
    const held: { action?: () => void | Promise<void> } = {};
    const holdAction = (action: () => void | Promise<void>) => {
      held.action = action;
    };
    const { rerender } = render(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={1} runGuarded={holdAction} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
    // "Save & continue": the save replaces the saved schema, and only then does the run start.
    rerender(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={2} runGuarded={holdAction} />
    );
    const { action } = held;
    if (!action) throw new Error('guarded action not captured');
    act(() => {
      void action();
    });

    expect(await screen.findByText('(2 rows)')).toBeInTheDocument();
    expect(screen.queryByText(OUTDATED_NOTE)).not.toBeInTheDocument();

    rerender(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={3} runGuarded={holdAction} />
    );
    expect(screen.getByText(OUTDATED_NOTE)).toBeInTheDocument();
  });

  it('flags a preview as outdated when the schema is saved while it is in flight', async () => {
    const pending = deferred<PreviewDataMartResponseDto>();
    previewDataMart.mockReturnValue(pending.promise);
    const { rerender } = render(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={1} runGuarded={runImmediately} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
    expect(await screen.findByText('Running preview…')).toBeInTheDocument();
    // The main Save button lands while the warehouse query is still running.
    rerender(
      <DataMartPreviewPanel dataMartId='dm1' savedSchemaVersion={2} runGuarded={runImmediately} />
    );
    pending.resolve(response(2));

    expect(await screen.findByText('(2 rows)')).toBeInTheDocument();
    expect(screen.getByText(OUTDATED_NOTE)).toBeInTheDocument();
  });

  it('drops the previous Data Mart rows and aborts its query when keyed to another Data Mart', async () => {
    previewDataMart.mockResolvedValueOnce(response(2));
    const { rerender } = render(
      <DataMartPreviewPanel
        key='dm1'
        dataMartId='dm1'
        savedSchemaVersion={1}
        runGuarded={runImmediately}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
    await screen.findByText('(2 rows)');

    // A Re-run still in flight when the user navigates to another Data Mart.
    const pending = deferred<PreviewDataMartResponseDto>();
    previewDataMart.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Re-run' }));
    const signal = previewDataMart.mock.calls[1][2] as AbortSignal;

    rerender(
      <DataMartPreviewPanel
        key='dm2'
        dataMartId='dm2'
        savedSchemaVersion={1}
        runGuarded={runImmediately}
      />
    );
    expect(signal.aborted).toBe(true);
    pending.resolve(response(5));

    expect(await screen.findByRole('button', { name: 'Preview data' })).toBeInTheDocument();
    expect(screen.queryByText('(2 rows)')).not.toBeInTheDocument();
    expect(screen.queryByText('(5 rows)')).not.toBeInTheDocument();
  });

  it('offers filters by the saved field type: none for REPEATED fields', async () => {
    const schema = {
      type: 'bigquery-data-mart-schema',
      fields: [
        { name: 'country', type: 'STRING', mode: 'NULLABLE' },
        { name: 'tags', type: 'STRING', mode: 'REPEATED' },
        {
          name: 'items',
          type: 'RECORD',
          mode: 'REPEATED',
          fields: [{ name: 'sku', type: 'STRING', mode: 'NULLABLE' }],
        },
      ],
    } as unknown as DataMartSchema;
    previewDataMart.mockResolvedValue({
      ...response(1),
      // The warehouse reports a REPEATED field by its element type.
      columns: [
        { name: 'country', type: 'STRING' },
        { name: 'tags', type: 'STRING' },
        { name: 'items', type: 'RECORD' },
      ],
      rows: [['UA', '["a"]', '[{"sku":"x"}]']],
    });
    render(
      <DataMartPreviewPanel
        dataMartId='dm1'
        savedSchemaVersion={schema}
        filterTypes={previewFilterTypesFromSchema(schema)}
        runGuarded={runImmediately}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
    await screen.findByText('(1 row)');

    expect(screen.getByRole('button', { name: 'Filter country' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter tags' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter items' })).not.toBeInTheDocument();
  });

  it('falls back to the reported column type for a field missing from the saved schema', async () => {
    previewDataMart.mockResolvedValue(response(2));
    render(
      <DataMartPreviewPanel
        dataMartId='dm1'
        savedSchemaVersion={1}
        filterTypes={new Map([['id', 'ARRAY<INTEGER>']])}
        runGuarded={runImmediately}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview data' }));
    await screen.findByText('(2 rows)');

    expect(screen.queryByRole('button', { name: 'Filter id' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filter country' })).toBeInTheDocument();
  });
});
