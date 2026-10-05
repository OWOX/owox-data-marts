import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../../features/idp/types';
import { dataMartService } from '../../../features/data-marts/shared/services/data-mart.service';
import { DataMartStatus } from '../../../features/data-marts/shared/enums/data-mart-status.enum';
import { useDataMartReferences } from './useDataMartReferences';

const currentUser = vi.hoisted(() => ({ value: null as User | null }));
vi.mock('../../../features/idp/hooks/useAuthState', () => ({ useUser: () => currentUser.value }));
vi.mock('../../../features/data-marts/shared/services/data-mart.service', () => ({
  dataMartService: { getDataMarts: vi.fn() },
}));

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useDataMartReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser.value = {
      id: 'user-1',
      email: 'user@example.com',
      roles: ['admin'],
      projectId: 'project',
      projectTitle: 'Project',
    } as User;
    vi.mocked(dataMartService.getDataMarts).mockResolvedValue([
      { id: 'beta', title: 'Beta', status: DataMartStatus.PUBLISHED },
      { id: 'alpha', title: 'Alpha', status: DataMartStatus.PUBLISHED },
      { id: 'draft', title: 'Draft', status: DataMartStatus.DRAFT },
    ] as Awaited<ReturnType<typeof dataMartService.getDataMarts>>);
  });

  it('excludes the current Data Mart without removing it from the shared project cache', async () => {
    const initialProps: { currentDataMartId?: string } = { currentDataMartId: 'alpha' };
    const hook = renderHook(
      ({ currentDataMartId }: { currentDataMartId?: string }) =>
        useDataMartReferences('project', currentDataMartId),
      { wrapper: createWrapper(), initialProps }
    );
    expect(await hook.result.current()).toEqual([{ id: 'beta', title: 'Beta' }]);
    hook.rerender({ currentDataMartId: 'beta' });
    expect(await hook.result.current()).toEqual([{ id: 'alpha', title: 'Alpha' }]);
    hook.rerender({ currentDataMartId: undefined });
    expect(await hook.result.current()).toEqual([
      { id: 'alpha', title: 'Alpha' },
      { id: 'beta', title: 'Beta' },
    ]);
    expect(dataMartService.getDataMarts).toHaveBeenCalledTimes(1);
  });

  it("does not reuse the previous user's cached references after a user switch", async () => {
    const hook = renderHook(() => useDataMartReferences('project', 'alpha'), {
      wrapper: createWrapper(),
    });
    expect(await hook.result.current()).toEqual([{ id: 'beta', title: 'Beta' }]);
    currentUser.value = { ...currentUser.value!, id: 'user-2' };
    vi.mocked(dataMartService.getDataMarts).mockResolvedValue([
      { id: 'gamma', title: 'Gamma', status: DataMartStatus.PUBLISHED },
    ] as Awaited<ReturnType<typeof dataMartService.getDataMarts>>);
    hook.rerender();
    expect(await hook.result.current()).toEqual([{ id: 'gamma', title: 'Gamma' }]);
    expect(dataMartService.getDataMarts).toHaveBeenCalledTimes(2);
  });

  it('does not fetch references for a different project or an unauthenticated user', async () => {
    const hook = renderHook(() => useDataMartReferences('other-project', 'alpha'), {
      wrapper: createWrapper(),
    });
    expect(await hook.result.current()).toEqual([]);
    currentUser.value = null;
    hook.rerender();
    expect(await hook.result.current()).toEqual([]);
    expect(dataMartService.getDataMarts).not.toHaveBeenCalled();
  });
});
