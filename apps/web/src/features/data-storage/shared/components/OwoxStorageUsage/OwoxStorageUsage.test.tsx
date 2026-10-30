import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwoxStorageUsageResponseDto } from '../../api/types';
import { OwoxStorageUsage } from './OwoxStorageUsage';

const getOwoxStorageUsage = vi.hoisted(() => vi.fn());
const deleteOwoxStorageTable = vi.hoisted(() => vi.fn());
vi.mock('../../api', () => ({
  dataStorageApiService: { getOwoxStorageUsage, deleteOwoxStorageTable },
}));

const usage = (patch: Partial<OwoxStorageUsageResponseDto> = {}): OwoxStorageUsageResponseDto => ({
  plan: 'FREE',
  usedBytes: 512 * 2 ** 20,
  limitBytes: 2 ** 30,
  tables: [],
  ...patch,
});

const FULL =
  'This storage is full. New connector runs are refused until you delete tables or upgrade the plan.';

describe('OwoxStorageUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteOwoxStorageTable.mockResolvedValue(undefined);
  });

  it('shows FREE usage', async () => {
    getOwoxStorageUsage.mockResolvedValue(usage());
    render(<OwoxStorageUsage storageId='s1' />);

    expect(await screen.findByText('512 MB of 1 GB used')).toBeInTheDocument();
    expect(screen.queryByText(FULL)).toBeNull();
  });

  it('shows PAID usage with the included volume', async () => {
    getOwoxStorageUsage.mockResolvedValue(
      usage({ plan: 'PAID', usedBytes: 12 * 2 ** 30, limitBytes: 10 * 2 ** 30 })
    );
    render(<OwoxStorageUsage storageId='s1' />);

    expect(await screen.findByText('12 GB used, 10 GB included')).toBeInTheDocument();
    expect(screen.queryByText(FULL)).toBeNull();
  });

  it('warns when a FREE storage is full', async () => {
    getOwoxStorageUsage.mockResolvedValue(usage({ usedBytes: 2 ** 30 }));
    render(<OwoxStorageUsage storageId='s1' />);

    expect(await screen.findByText(FULL)).toBeInTheDocument();
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
    await waitFor(() => {
      expect(getOwoxStorageUsage).toHaveBeenCalledTimes(2);
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
