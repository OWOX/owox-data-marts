import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageType, type StorageCredentialSummary } from '../../../shared';
import { dataStorageApiService } from '../../../shared/api';
import type { DataStorageResponseDto } from '../../../shared/api/types';
import { DataStorageProvider } from '../../../shared/model/context';
import type { DataStorage } from '../../../shared/model/types/data-storage';
import { DataStorageConfigSheet } from './DataStorageConfigSheet';

vi.mock('../../../shared/api/data-storage-api.service', () => ({
  dataStorageApiService: { getDataStorageById: vi.fn(), updateDataStorage: vi.fn() },
}));

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../../../utils/data-layer', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args) as unknown,
}));

vi.mock('react-hot-toast', () => {
  const toastMock = { error: vi.fn(), success: vi.fn() };
  return { default: toastMock, toast: toastMock };
});

vi.mock('../../../../idp', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: { id: 'user-1', projectId: 'project-1', roles: ['admin'] },
    signOut: vi.fn(),
  }),
}));

vi.mock('../../../../idp/hooks/useAuthState', () => ({
  useUser: () => ({ id: 'user-1', fullName: 'Admin', email: 'admin@example.com', avatar: null }),
}));

vi.mock('../../../../idp/hooks/useRole', () => ({ useIsAdmin: () => false }));

vi.mock('../../../../../shared/components/OwnersSection/OwnersSection', () => ({
  OwnersSection: () => null,
}));

vi.mock('../../../../contexts/components/ContextPicker/ContextPicker', () => ({
  ContextPicker: () => null,
}));

vi.mock('../../../../contexts/components/AddContextSheet/AddContextSheet', () => ({
  AddContextSheet: () => null,
}));

vi.mock('../../../../contexts/hooks/useInlineContextCreate', () => ({
  useInlineContextCreate: () => ({ pickerProps: {}, sheetProps: {} }),
}));

vi.mock('../../../shared/components/DataStorageHealthIndicator/DataStorageHealthIndicator', () => ({
  DataStorageHealthIndicator: () => null,
}));

vi.mock('../../../../credentials/components/ConsumerCredentialField', () => ({
  ConsumerCredentialField: () => null,
}));

vi.mock('@owox/ui/components/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <aside role='dialog'>{children}</aside>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

function response(reusableCredential: StorageCredentialSummary): DataStorageResponseDto {
  return {
    id: 'storage-1',
    title: 'BigQuery',
    type: DataStorageType.GOOGLE_BIGQUERY,
    config: { projectId: 'my-project', location: 'US' },
    createdAt: '2026-06-09T10:00:00.000Z',
    modifiedAt: '2026-06-09T10:00:00.000Z',
    publishedDataMartsCount: 1,
    draftDataMartsCount: 0,
    reusableCredential,
  };
}

const boundTo = (id: string): StorageCredentialSummary => ({
  access: 'visible',
  id,
  title: id,
  definitionId: 'google-service-account',
  providerName: 'BigQuery Service Account',
  identity: null,
  state: 'ready',
});

// The Storage as a Data Mart carries it: no Credential summary.
const embedded = {
  id: 'storage-1',
  title: 'BigQuery',
  type: DataStorageType.GOOGLE_BIGQUERY,
  config: { projectId: 'my-project', location: 'US' },
  createdAt: new Date('2026-06-09T10:00:00.000Z'),
  modifiedAt: new Date('2026-06-09T10:00:00.000Z'),
} satisfies DataStorage;

function deferred() {
  let resolve: (dto: DataStorageResponseDto) => void = () => undefined;
  const promise = new Promise<DataStorageResponseDto>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderSheet() {
  const queryClient = new QueryClient();
  const sheet = (isOpen: boolean, dataStorage: DataStorage, onSaveSuccess = vi.fn()) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DataStorageProvider>
          <DataStorageConfigSheet
            isOpen={isOpen}
            onClose={vi.fn()}
            dataStorage={dataStorage}
            onSaveSuccess={onSaveSuccess}
          />
        </DataStorageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { sheet, ...render(sheet(true, embedded)) };
}

async function renameAndSave() {
  fireEvent.change(await screen.findByPlaceholderText('Storage title'), {
    target: { value: 'Renamed' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('DataStorageConfigSheet — opened again from a Data Mart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits the binding the Storage has now, not the one it had at an earlier open', async () => {
    const secondLoad = deferred();
    vi.mocked(dataStorageApiService.getDataStorageById)
      .mockResolvedValueOnce(response(boundTo('cred-a')))
      .mockReturnValueOnce(secondLoad.promise);
    vi.mocked(dataStorageApiService.updateDataStorage).mockResolvedValue(
      response(boundTo('cred-b'))
    );
    const { sheet, rerender } = renderSheet();
    await screen.findByRole('button', { name: 'Save' });

    rerender(sheet(false, embedded));
    // Meanwhile the Storage is switched to cred-b elsewhere.
    rerender(sheet(true, embedded));

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    secondLoad.resolve(response(boundTo('cred-b')));
    await renameAndSave();

    await waitFor(() => {
      expect(dataStorageApiService.updateDataStorage).toHaveBeenCalled();
    });
    const [, request] = vi.mocked(dataStorageApiService.updateDataStorage).mock.calls[0];
    expect(request).not.toHaveProperty('reusableCredentialId');
    expect(trackEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'storage_credential_selected' })
    );
  });

  // After a save the Data Mart page passes back the copy the save returned.
  it('loads the Storage again when reopened with the copy an earlier save returned', async () => {
    const secondLoad = deferred();
    vi.mocked(dataStorageApiService.getDataStorageById)
      .mockResolvedValueOnce(response(boundTo('cred-a')))
      .mockReturnValueOnce(secondLoad.promise);
    vi.mocked(dataStorageApiService.updateDataStorage).mockResolvedValue(
      response(boundTo('cred-a'))
    );
    const onSaveSuccess = vi.fn();
    const { sheet, rerender } = renderSheet();
    rerender(sheet(true, embedded, onSaveSuccess));
    await renameAndSave();
    await waitFor(() => {
      expect(onSaveSuccess).toHaveBeenCalled();
    });
    const saved = onSaveSuccess.mock.calls[0][0] as DataStorage;

    rerender(sheet(false, saved));
    rerender(sheet(true, saved));

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(dataStorageApiService.getDataStorageById).toHaveBeenCalledTimes(2);
  });
});
