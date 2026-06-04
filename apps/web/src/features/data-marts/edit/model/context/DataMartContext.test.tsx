// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataMartProvider } from './DataMartContext';
import { DataMartContext } from './context';
import { dataMartService } from '../../../shared';

vi.mock('../../../../../hooks/useAutoRefresh', () => ({
  useAutoRefresh: vi.fn(),
}));

vi.mock('../../../../../components/AppSidebar/SetupChecklist/useSetupProgress', () => ({
  useRefreshSetupProgress: () => vi.fn(),
}));

vi.mock('../../../../../utils', () => ({
  pushToDataLayer: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../shared', async () => {
  const actual = await vi.importActual<typeof import('../../../shared')>('../../../shared');

  return {
    ...actual,
    dataMartService: {
      cancelDataMartRun: vi.fn(),
    },
  };
});

describe('DataMartProvider cancelDataMartRun', () => {
  it('rejects when the API cancellation request fails', async () => {
    const apiError = {
      message: 'cancel failed',
      path: '/api/data-marts/dm-1/runs/run-1/cancel',
      statusCode: 409,
      timestamp: '2026-06-04T12:00:00.000Z',
    };
    const axiosError = {
      response: {
        data: apiError,
      },
    };
    let cancelPromise: Promise<void> | undefined;

    vi.mocked(dataMartService.cancelDataMartRun).mockRejectedValue(axiosError);

    function Consumer() {
      const context = useContext(DataMartContext)!;
      return (
        <button
          type='button'
          onClick={() => {
            cancelPromise = context.cancelDataMartRun('dm-1', 'run-1');
          }}
        >
          Cancel
        </button>
      );
    }

    render(
      <DataMartProvider>
        <Consumer />
      </DataMartProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await act(async () => {
      await expect(cancelPromise).rejects.toBe(axiosError);
    });
  });
});
