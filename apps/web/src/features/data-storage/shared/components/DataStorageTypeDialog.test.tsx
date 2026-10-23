// @vitest-environment happy-dom
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { DataStorageTypeDialog } from './DataStorageTypeDialog';

vi.mock('../../../../app/store/hooks', () => ({ useFlags: vi.fn() }));

const { useFlags } = await import('../../../../app/store/hooks');

function renderDialog(flags: Record<string, string>) {
  vi.mocked(useFlags).mockReturnValue({ flags } as ReturnType<typeof useFlags>);
  return render(
    <DataStorageTypeDialog
      isOpen
      onClose={vi.fn()}
      onSelect={vi.fn()}
      isCreatingDataStorage={false}
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
