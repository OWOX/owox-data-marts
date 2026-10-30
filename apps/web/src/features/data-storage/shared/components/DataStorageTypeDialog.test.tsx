// @vitest-environment happy-dom
import { render, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { DataStorageTypeDialog } from './DataStorageTypeDialog';

vi.mock('../../../../app/store/hooks', () => ({ useFlags: vi.fn() }));

const { useFlags } = await import('../../../../app/store/hooks');

function renderDialog(flags: Record<string, string>, onSelectOwoxStorage?: () => void) {
  vi.mocked(useFlags).mockReturnValue({ flags } as ReturnType<typeof useFlags>);
  return render(
    <DataStorageTypeDialog
      isOpen
      onClose={vi.fn()}
      onSelect={vi.fn()}
      isCreatingDataStorage={false}
      onSelectOwoxStorage={onSelectOwoxStorage}
    />
  );
}

describe('DataStorageTypeDialog', () => {
  afterEach(cleanup);

  it('hides DuckDB when the flag is absent', () => {
    const { queryByText } = renderDialog({});
    expect(queryByText('Google BigQuery')).not.toBeNull();
    expect(queryByText('DuckDB')).toBeNull();
  });

  it("hides DuckDB when the flag is 'false'", () => {
    const { queryByText } = renderDialog({ DUCKDB_STORAGE_ENABLED: 'false' });
    expect(queryByText('Google BigQuery')).not.toBeNull();
    expect(queryByText('DuckDB')).toBeNull();
  });

  it('shows DuckDB when the flag is true', () => {
    const { getByText } = renderDialog({ DUCKDB_STORAGE_ENABLED: 'true' });
    expect(getByText('DuckDB')).toBeTruthy();
  });
});

describe('DataStorageTypeDialog: OWOX Storage', () => {
  afterEach(cleanup);

  it('shows OWOX Storage first when the flag is on', () => {
    const onSelect = vi.fn();
    renderDialog({ OWOX_STORAGE_ENABLED: 'true' }, onSelect);
    const buttons = within(screen.getByTestId('storageTypeDialog')).getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('OWOX Storage');
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it.each([
    ['the flag is off', { OWOX_STORAGE_ENABLED: 'false' }, vi.fn()],
    ['the flag is missing', {}, vi.fn()],
    ['no handler is passed', { OWOX_STORAGE_ENABLED: 'true' }, undefined],
  ])('hides it when %s', (_name, value, handler) => {
    renderDialog(value, handler);
    expect(screen.queryByText('OWOX Storage')).not.toBeInTheDocument();
  });
});
