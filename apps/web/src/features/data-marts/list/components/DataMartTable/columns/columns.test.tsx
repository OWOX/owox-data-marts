import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { titleFilterFn, type TitleFilterValue } from './columns';
import type { Row } from '@tanstack/react-table';
import type { DataMartListItem } from '../../../model/types';

function makeRow(id: string, title: string): Row<DataMartListItem> {
  return {
    original: { id } as DataMartListItem,
    getValue: (colId: string) => (colId === 'title' ? title : undefined),
  } as unknown as Row<DataMartListItem>;
}

function makeFilter(text: string, semanticIds: string[]): TitleFilterValue {
  return { text, semanticIds };
}

describe('titleFilterFn', () => {
  const noop = () => {};

  it('passes all rows when filterValue is falsy', () => {
    const row = makeRow('dm-1', 'Sales Data');
    expect(titleFilterFn(row, 'title', undefined, noop)).toBe(true);
    expect(titleFilterFn(row, 'title', null, noop)).toBe(true);
  });

  it('passes all rows when text and semanticIds are both empty', () => {
    const row = makeRow('dm-1', 'Sales Data');
    expect(titleFilterFn(row, 'title', makeFilter('', []), noop)).toBe(true);
  });

  it('passes row that matches text (substring)', () => {
    const row = makeRow('dm-1', 'Sales Data');
    expect(titleFilterFn(row, 'title', makeFilter('sales', []), noop)).toBe(true);
  });

  it('passes row that matches text case-insensitively', () => {
    const row = makeRow('dm-1', 'Sales Data');
    expect(titleFilterFn(row, 'title', makeFilter('SALES', []), noop)).toBe(true);
  });

  it('passes row that matches semanticIds only (no text)', () => {
    const row = makeRow('dm-1', 'Sales Data');
    expect(titleFilterFn(row, 'title', makeFilter('', ['dm-1']), noop)).toBe(true);
  });

  it('passes row that matches semanticIds when text is set but row title does not match', () => {
    const row = makeRow('dm-1', 'Revenue Metrics');
    expect(titleFilterFn(row, 'title', makeFilter('sales', ['dm-1']), noop)).toBe(true);
  });

  it('passes row that matches both text and semanticIds', () => {
    const row = makeRow('dm-1', 'Sales Data');
    expect(titleFilterFn(row, 'title', makeFilter('sales', ['dm-1']), noop)).toBe(true);
  });

  it('blocks row that matches neither text nor semanticIds', () => {
    const row = makeRow('dm-2', 'Revenue Metrics');
    expect(titleFilterFn(row, 'title', makeFilter('sales', ['dm-1']), noop)).toBe(false);
  });

  it('blocks row when text set but no match and id not in semanticIds', () => {
    const row = makeRow('dm-2', 'Revenue Metrics');
    expect(titleFilterFn(row, 'title', makeFilter('sales', []), noop)).toBe(false);
  });
});

import { getDataMartColumns } from './columns';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel } from '@tanstack/react-table';
import type { DataMartStatus } from '../../../../shared';

function buildDataMart(id: string, title: string): DataMartListItem {
  return {
    id,
    title,
    status: { code: 'PUBLISHED' as DataMartStatus, displayName: 'Published' },
    storageType: 'GOOGLE_BIGQUERY',
    definitionType: 'SQL',
    connectorSourceName: null,
    createdAt: new Date(),
    triggersCount: 0,
    reportsCount: 0,
    createdByUser: null,
    businessOwnerUsers: [],
    technicalOwnerUsers: [],
    availableForReporting: false,
    availableForMaintenance: false,
    contexts: [],
    storageTitle: null,
  } as unknown as DataMartListItem;
}

function TitleCellHarness({
  rows,
  filterValue,
}: {
  rows: DataMartListItem[];
  filterValue?: TitleFilterValue;
}) {
  const columns = getDataMartColumns();
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    state: filterValue ? { columnFilters: [{ id: 'title', value: filterValue }] } : {},
  });

  return (
    <>
      {table.getRowModel().rows.map(row => {
        const badgeCol = columns.find(c => c.id === 'semanticMatch');
        if (!badgeCol?.cell) return null;
        const CellComponent = badgeCol.cell as (props: {
          row: typeof row;
          table: typeof table;
        }) => React.ReactNode;
        return (
          <div key={row.id} data-testid={`row-${row.original.id}`}>
            {CellComponent({ row, table })}
          </div>
        );
      })}
    </>
  );
}

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient();
  return render(createElement(QueryClientProvider, { client }, ui));
}

describe('semanticMatch badge column — Sparkles icon logic', () => {
  it('shows no icon when search is empty', () => {
    renderWithProviders(<TitleCellHarness rows={[buildDataMart('dm-1', 'Sales Data')]} />);
    expect(screen.queryByTestId('semanticMatchIcon')).not.toBeInTheDocument();
  });

  it('shows icon for a semantically matched row even when it also matches by text', () => {
    renderWithProviders(
      <TitleCellHarness
        rows={[buildDataMart('dm-1', 'Sales Data')]}
        filterValue={{ text: 'sales', semanticIds: ['dm-1'] }}
      />
    );
    expect(screen.getByTestId('semanticMatchIcon')).toBeInTheDocument();
  });

  it('shows icon for a semantic-only match (title does not contain text)', () => {
    renderWithProviders(
      <TitleCellHarness
        rows={[buildDataMart('dm-1', 'Revenue Metrics')]}
        filterValue={{ text: 'sales', semanticIds: ['dm-1'] }}
      />
    );
    expect(screen.getByTestId('semanticMatchIcon')).toBeInTheDocument();
  });

  it('shows no icon for a substring-only match that is not in semanticIds', () => {
    renderWithProviders(
      <TitleCellHarness
        rows={[buildDataMart('dm-1', 'Sales Data')]}
        filterValue={{ text: 'sales', semanticIds: [] }}
      />
    );
    expect(screen.queryByTestId('semanticMatchIcon')).not.toBeInTheDocument();
  });

  it('shows no icon when semanticIds is empty and no text search', () => {
    renderWithProviders(
      <TitleCellHarness
        rows={[buildDataMart('dm-1', 'Revenue Metrics')]}
        filterValue={{ text: '', semanticIds: [] }}
      />
    );
    expect(screen.queryByTestId('semanticMatchIcon')).not.toBeInTheDocument();
  });
});
