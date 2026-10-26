import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBaseTable } from '../../hooks/useBaseTable';
import { TableColumnSearch } from './TableColumnSearch';

interface Row {
  title: string;
}

const columns: ColumnDef<Row>[] = [{ accessorKey: 'title', header: 'Title' }];
const data: Row[] = [{ title: 'Facebook Ads' }, { title: 'Google Ads' }];
const SESSION_KEY = 'test-list-column-filters:p1';

function SearchableList({ sessionKey }: { sessionKey?: string }) {
  const { table } = useBaseTable<Row>({
    data,
    columns,
    storageKeyPrefix: 'test-list',
    columnFiltersSessionKey: sessionKey,
  });

  return (
    <>
      <TableColumnSearch table={table} columnId='title' placeholder='Search' />
      <ul>
        {table.getRowModel().rows.map(row => (
          <li key={row.id}>{row.original.title}</li>
        ))}
      </ul>
    </>
  );
}

function getSearchInput() {
  return screen.getByPlaceholderText('Search');
}

describe('TableColumnSearch', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the clear button only while there is a search', () => {
    render(<SearchableList />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    fireEvent.change(getSearchInput(), { target: { value: 'face' } });

    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    expect(screen.queryByText('Google Ads')).not.toBeInTheDocument();
  });

  it('clears the search and keeps the focus in the input', () => {
    render(<SearchableList />);
    fireEvent.change(getSearchInput(), { target: { value: 'face' } });

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(getSearchInput()).toHaveValue('');
    expect(getSearchInput()).toHaveFocus();
    expect(screen.getByText('Google Ads')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('keeps the search when the list is opened again with a session key', () => {
    const first = render(<SearchableList sessionKey={SESSION_KEY} />);
    fireEvent.change(getSearchInput(), { target: { value: 'face' } });
    first.unmount();

    render(<SearchableList sessionKey={SESSION_KEY} />);

    expect(getSearchInput()).toHaveValue('face');
    expect(screen.getByText('Facebook Ads')).toBeInTheDocument();
    expect(screen.queryByText('Google Ads')).not.toBeInTheDocument();
  });

  it('starts empty again after the search was cleared', () => {
    const first = render(<SearchableList sessionKey={SESSION_KEY} />);
    fireEvent.change(getSearchInput(), { target: { value: 'face' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    first.unmount();

    render(<SearchableList sessionKey={SESSION_KEY} />);

    expect(getSearchInput()).toHaveValue('');
  });

  it('does not keep the search without a session key', () => {
    const first = render(<SearchableList />);
    fireEvent.change(getSearchInput(), { target: { value: 'face' } });
    first.unmount();

    render(<SearchableList />);

    expect(getSearchInput()).toHaveValue('');
  });
});
