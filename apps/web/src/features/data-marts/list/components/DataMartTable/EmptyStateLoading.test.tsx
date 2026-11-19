// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataMartTable } from './DataMartTable';
import { DataMartListProvider } from '../../model/context';
import { useDataMartList } from '../../model/hooks/useDataMartList';
import { useOnboardingVideo } from '../../../../../shared/hooks';
import { dataMartService } from '../../../shared/services/data-mart.service';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../../../utils/data-layer', () => ({ trackEvent }));
vi.mock('../../../../idp', () => ({
  useAuth: () => ({ user: { mcpServerUrl: 'https://mcp.example.com' } }),
  useRole: () => ({ canEdit: true }),
}));
vi.mock('../../../../../shared/hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../../shared/hooks')>();
  return {
    ...actual,
    useOnboardingVideo: vi.fn(),
    useProjectRoute: () => ({
      projectId: 'project-1',
      scope: (path: string) => `/ui/project-1${path}`,
      navigate: vi.fn(),
    }),
  };
});
vi.mock('../../model/hooks/useDataMartHealthStatusPrefetch', () => ({
  useDataMartHealthStatusPrefetch: vi.fn(),
}));

function Page() {
  const { items, loading, error, loadDataMarts, refreshList } = useDataMartList();
  useEffect(() => {
    void loadDataMarts();
  }, [loadDataMarts]);
  return (
    <DataMartTable
      connectors={[]}
      columns={[]}
      data={items}
      isLoading={loading}
      loadError={error}
      deleteDataMart={vi.fn()}
      publishDataMart={vi.fn()}
      refetchDataMarts={refreshList}
    />
  );
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <DataMartListProvider>
          <Page />
        </DataMartListProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Data Marts list empty state', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    trackEvent.mockClear();
  });

  it('shows no empty state and sends no promo event while the list loads', () => {
    vi.spyOn(dataMartService, 'getDataMarts').mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.queryByText(/Build Your First Data/)).not.toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('shows no empty state when the load failed', async () => {
    vi.spyOn(dataMartService, 'getDataMarts').mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByText('Data Marts could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByText(/Build Your First Data/)).not.toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('loads again when Retry is clicked', async () => {
    const load = vi.spyOn(dataMartService, 'getDataMarts').mockRejectedValue(new Error('boom'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await vi.waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    expect(trackEvent).not.toHaveBeenCalled();
  });

  const lastShouldShow = () =>
    vi.mocked(useOnboardingVideo).mock.lastCall?.[0] as { shouldShow: boolean } | undefined;

  it('does not open the onboarding video over the load error', async () => {
    vi.spyOn(dataMartService, 'getDataMarts').mockRejectedValue(new Error('boom'));
    renderPage();
    await screen.findByText('Data Marts could not be loaded.');
    expect(lastShouldShow()?.shouldShow).toBe(false);
  });

  it('opens the onboarding video for an empty project', async () => {
    vi.spyOn(dataMartService, 'getDataMarts').mockResolvedValue([]);
    renderPage();
    await screen.findByText(/Build Your First Data/);
    expect(lastShouldShow()?.shouldShow).toBe(true);
  });
});
