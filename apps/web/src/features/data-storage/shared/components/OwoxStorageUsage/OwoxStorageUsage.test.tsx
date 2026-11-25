import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwoxStorageUsageResponseDto } from '../../api/types';
import { formatDateOnly } from '../../../../../utils/date-formatters';
import { OwoxStorageUsage } from './OwoxStorageUsage';

const getOwoxStorageUsage = vi.hoisted(() => vi.fn());
const deleteOwoxStorageTable = vi.hoisted(() => vi.fn());
const restoreOwoxStorage = vi.hoisted(() => vi.fn());
vi.mock('../../api', () => ({
  dataStorageApiService: { getOwoxStorageUsage, deleteOwoxStorageTable, restoreOwoxStorage },
}));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccess },
  toast: { success: toastSuccess },
}));

const usage = (patch: Partial<OwoxStorageUsageResponseDto> = {}): OwoxStorageUsageResponseDto => ({
  usedBytes: 512 * 2 ** 20,
  limitBytes: 2 ** 30,
  tables: [],
  deletedAt: null,
  ...patch,
});

const FULL =
  'This storage is full. New connector runs are refused until you delete tables. To get more space, contact OWOX support.';

// Noon UTC stays on the same calendar day in every time zone the tests may run in.
const DATE = formatDateOnly('2026-12-05T12:00:00.000Z');

describe('OwoxStorageUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwoxStorageUsage.mockReset();
    deleteOwoxStorageTable.mockResolvedValue(undefined);
    restoreOwoxStorage.mockResolvedValue(undefined);
  });

  it('shows usage against the limit', async () => {
    getOwoxStorageUsage.mockResolvedValue(usage());
    render(<OwoxStorageUsage storageId='s1' />);

    expect(await screen.findByText('512 MB of 1 GB used')).toBeInTheDocument();
    expect(screen.queryByText(FULL)).toBeNull();
  });

  it('says what it loads while the usage loads', () => {
    getOwoxStorageUsage.mockReturnValue(new Promise(() => undefined));
    render(<OwoxStorageUsage storageId='s1' />);

    expect(screen.getByText('Loading storage metadata…')).toBeInTheDocument();
  });

  it('reloads the usage on Refresh and keeps the old one until then', async () => {
    getOwoxStorageUsage.mockResolvedValueOnce(usage());
    render(<OwoxStorageUsage storageId='s1' />);
    await screen.findByText(
      'No tables yet. Connector Data Marts create tables here when they load data.'
    );

    let resolveRefresh: (value: OwoxStorageUsageResponseDto) => void = () => undefined;
    getOwoxStorageUsage.mockReturnValueOnce(
      new Promise(resolve => {
        resolveRefresh = resolve;
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(screen.getByText('512 MB of 1 GB used')).toBeInTheDocument();
    resolveRefresh(usage({ tables: [{ name: 'holidays', rowCount: 3, sizeBytes: 188 }] }));
    expect(await screen.findByText('holidays')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
    expect(getOwoxStorageUsage).toHaveBeenCalledTimes(2);
    expect(getOwoxStorageUsage).toHaveBeenNthCalledWith(1, 's1', false);
    expect(getOwoxStorageUsage).toHaveBeenNthCalledWith(2, 's1', true);
  });

  it('shows a larger limit set by support', async () => {
    getOwoxStorageUsage.mockResolvedValue(
      usage({ usedBytes: 12 * 2 ** 30, limitBytes: 100 * 2 ** 30 })
    );
    render(<OwoxStorageUsage storageId='s1' />);

    expect(await screen.findByText('12 GB of 100 GB used')).toBeInTheDocument();
    expect(screen.queryByText(/included/)).toBeNull();
    expect(screen.queryByText(FULL)).toBeNull();
  });

  it('warns when a storage is above the limit', async () => {
    getOwoxStorageUsage.mockResolvedValue(
      usage({ usedBytes: 120 * 2 ** 30, limitBytes: 100 * 2 ** 30 })
    );
    render(<OwoxStorageUsage storageId='s1' />);

    expect(await screen.findByText('120 GB of 100 GB used')).toBeInTheDocument();
    expect(screen.getByText(FULL)).toBeInTheDocument();
  });

  it('warns when a storage is full', async () => {
    getOwoxStorageUsage.mockResolvedValue(usage({ usedBytes: 2 ** 30 }));
    render(<OwoxStorageUsage storageId='s1' />);

    expect(await screen.findByText(FULL)).toBeInTheDocument();
  });

  it('shows no deletion notice for an active storage', async () => {
    getOwoxStorageUsage.mockResolvedValue(usage());
    render(<OwoxStorageUsage storageId='s1' />);

    await screen.findByText('512 MB of 1 GB used');
    expect(screen.queryByText(/will be deleted/)).toBeNull();
    expect(screen.queryByText(/were deleted/)).toBeNull();
  });

  it('shows only the deleted notice for a deleted storage', async () => {
    getOwoxStorageUsage.mockResolvedValue(
      usage({ usedBytes: 0, deletedAt: '2026-12-05T12:00:00.000Z' })
    );
    render(<OwoxStorageUsage storageId='s1' />);

    expect(
      await screen.findByText(
        `This storage and its data were deleted on ${DATE}. Restore it to use it again. The Data Marts that use it keep their settings, and their next connector runs load their data again.`
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/of .* used/)).toBeNull();
    expect(screen.queryByText(/No tables yet/)).toBeNull();
  });

  it('restores a deleted storage and reloads its usage', async () => {
    getOwoxStorageUsage
      .mockResolvedValueOnce(usage({ deletedAt: '2026-12-05T12:00:00.000Z' }))
      .mockResolvedValue(usage());
    render(<OwoxStorageUsage storageId='s1' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore storage' }));

    expect(await screen.findByText('512 MB of 1 GB used')).toBeInTheDocument();
    expect(restoreOwoxStorage).toHaveBeenCalledWith('s1');
    expect(getOwoxStorageUsage).toHaveBeenNthCalledWith(2, 's1', true);
    expect(toastSuccess).toHaveBeenCalledWith('Storage restored.');
  });

  it('disables the restore button while restoring', async () => {
    getOwoxStorageUsage.mockResolvedValue(usage({ deletedAt: '2026-12-05T12:00:00.000Z' }));
    restoreOwoxStorage.mockReturnValue(new Promise(() => undefined));
    render(<OwoxStorageUsage storageId='s1' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore storage' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Restore storage' })).toBeDisabled();
    });
  });

  it('keeps the deleted notice when the restore fails', async () => {
    getOwoxStorageUsage.mockResolvedValue(usage({ deletedAt: '2026-12-05T12:00:00.000Z' }));
    restoreOwoxStorage.mockRejectedValue(new Error('boom'));
    render(<OwoxStorageUsage storageId='s1' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Restore storage' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Restore storage' })).toBeEnabled();
    });
    expect(getOwoxStorageUsage).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('lists tables with rows and sizes', async () => {
    getOwoxStorageUsage.mockResolvedValue(
      usage({ tables: [{ name: 'holidays', sizeBytes: 225, rowCount: 8 }] })
    );
    render(<OwoxStorageUsage storageId='s1' />);

    expect(await screen.findByText('holidays')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('225 Bytes')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    getOwoxStorageUsage.mockResolvedValue(usage());
    render(<OwoxStorageUsage storageId='s1' />);

    expect(
      await screen.findByText(
        'No tables yet. Connector Data Marts create tables here when they load data.'
      )
    ).toBeInTheDocument();
  });

  it('shows an error and retries', async () => {
    getOwoxStorageUsage.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(usage());
    render(<OwoxStorageUsage storageId='s1' />);

    expect(await screen.findByText('Storage usage could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText(/of 1 GB used/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('512 MB of 1 GB used')).toBeInTheDocument();
    expect(getOwoxStorageUsage).toHaveBeenCalledTimes(2);
  });

  it('deletes a table after confirmation and reloads', async () => {
    getOwoxStorageUsage.mockResolvedValue(
      usage({ tables: [{ name: 'holidays', sizeBytes: 225, rowCount: 8 }] })
    );
    render(<OwoxStorageUsage storageId='s1' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete table holidays' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('"holidays"');
    expect(dialog).toHaveTextContent('cannot be restored');

    fireEvent.click(screen.getByRole('button', { name: 'Delete table' }));

    await waitFor(() => {
      expect(deleteOwoxStorageTable).toHaveBeenCalledWith('s1', 'holidays');
    });
    // Another server can still cache the deleted table, so the reload skips the cache.
    await waitFor(() => {
      expect(getOwoxStorageUsage).toHaveBeenNthCalledWith(2, 's1', true);
    });
  });

  it('disables cancel while deleting', async () => {
    getOwoxStorageUsage.mockResolvedValue(
      usage({ tables: [{ name: 'holidays', sizeBytes: 225, rowCount: 8 }] })
    );
    deleteOwoxStorageTable.mockReturnValue(new Promise(() => undefined));
    render(<OwoxStorageUsage storageId='s1' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete table holidays' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Delete table' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
  });

  it('does not submit the enclosing form', async () => {
    getOwoxStorageUsage.mockResolvedValue(
      usage({ tables: [{ name: 'holidays', sizeBytes: 225, rowCount: 8 }] })
    );
    const onSubmit = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <OwoxStorageUsage storageId='s1' />
      </form>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Delete table holidays' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
