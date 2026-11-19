import { useEffect, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageList } from './DataStorageList';

const mocks = vi.hoisted(() => ({
  current: null as { id: string } | null,
  failNextFetch: false,
  mcp: true,
  mounts: 0,
  unmounts: 0,
  promoMounts: 0,
  configured: true,
  storage: (id: string): { id: string; type: string; config: Record<string, string> } => ({
    id,
    type: 'SNOWFLAKE',
    config: mocks.configured ? { account: 'acme', warehouse: 'main' } : {},
  }),
  storages: [{ id: 'storage-1', title: 'Existing', draftDataMartsCount: 0 }] as unknown[],
}));

vi.mock('../../../shared/model/hooks/useDataStorage.ts', () => ({
  useDataStorage: () => ({
    dataStorages: mocks.storages,
    currentDataStorage: mocks.current,
    loading: false,
    clearCurrentDataStorage: vi.fn(() => {
      mocks.current = null;
    }),
    fetchDataStorages: vi.fn(),
    getDataStorageById: vi.fn((id: string) => {
      if (mocks.failNextFetch) {
        mocks.failNextFetch = false;
        return Promise.reject(new Error('offline'));
      }
      mocks.current = mocks.storage(id);
      return Promise.resolve();
    }),
    deleteDataStorage: vi.fn(),
    createDataStorage: vi.fn(() => {
      mocks.current = mocks.storage('new-storage');
      return Promise.resolve({ id: 'new-storage' });
    }),
  }),
}));
vi.mock('../../../shared/hooks/usePublishDraftsTrigger.ts', () => ({
  usePublishDraftsTrigger: () => ({ run: vi.fn() }),
}));
vi.mock('../../../../../shared/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../../shared/hooks')>()),
  useProjectRoute: () => ({ scope: (path: string) => path, projectId: 'project-1' }),
}));
vi.mock('../DataStorageDetailsDialog', () => ({ DataStorageDetailsDialog: () => null }));
vi.mock('../DataStorageTable', () => ({
  getDataStorageColumns: () => [],
  DataStorageTable: ({
    onEdit,
    onOpenTypeDialog,
  }: {
    onEdit: (id: string) => void;
    onOpenTypeDialog: () => void;
  }) => (
    <>
      <button onClick={onOpenTypeDialog}>New Storage</button>
      <button
        onClick={() => {
          onEdit('storage-1');
        }}
      >
        Edit row
      </button>
      <button
        onClick={() => {
          onEdit('new-storage');
        }}
      >
        Edit new row
      </button>
    </>
  ),
}));
vi.mock('../../../shared/components/DataStorageTypeDialog.tsx', () => ({
  DataStorageTypeDialog: ({
    isOpen,
    onSelect,
  }: {
    isOpen: boolean;
    onSelect: (type: string) => void;
  }) =>
    isOpen ? (
      <button
        onClick={() => {
          onSelect('GOOGLE_BIGQUERY');
        }}
      >
        Pick type
      </button>
    ) : null,
}));
vi.mock('../../../edit', async () => ({
  useStorageSheetMcpPromo: (
    await import('../../../edit/components/DataStorageEditSheet/useStorageSheetMcpPromo')
  ).useStorageSheetMcpPromo,
  DataStorageConfigSheet: ({
    isOpen,
    onClose,
    promo,
  }: {
    isOpen: boolean;
    onClose: () => void;
    promo?: ReactNode;
  }) => {
    useEffect(() => {
      mocks.mounts += 1;
      return () => {
        mocks.unmounts += 1;
      };
    }, []);
    return isOpen ? (
      <div data-testid='sheet' data-has-promo={String(promo !== undefined)}>
        {promo}
        <button onClick={onClose}>Close sheet</button>
      </div>
    ) : null;
  },
}));
vi.mock('../../../../mcp-promo', async () => ({
  useIsMcpSetupPromoAvailable: () => mocks.mcp,
  McpPromoCard: (props: { placement: string; prompt: string; title: string; variant?: string }) => {
    useEffect(() => {
      mocks.promoMounts += 1;
    }, []);
    return (
      <div
        data-testid='promo'
        data-placement={props.placement}
        data-title={props.title}
        data-variant={props.variant}
      >
        {props.prompt}
      </div>
    );
  },
  buildMcpPrompt: (
    await vi.importActual<typeof import('../../../../mcp-promo/prompts')>(
      '../../../../mcp-promo/prompts'
    )
  ).buildMcpPrompt,
}));

function expectSetupPromo(promo: HTMLElement, storageId: string) {
  expect(promo).toHaveAttribute('data-placement', 'storage_sheet');
  expect(promo).toHaveAttribute('data-title', 'Set it up with your AI assistant');
  expect(promo).toHaveTextContent(`finish configuring Storage ${storageId} in project project-1.`);
}

function expectMaintainPromo(promo: HTMLElement, storageId: string) {
  expect(promo).toHaveAttribute('data-placement', 'storage_sheet_maintain');
  expect(promo).toHaveAttribute('data-title', 'Maintain it with your AI assistant');
  expect(promo).toHaveTextContent(`maintain Storage ${storageId} in project project-1.`);
}

function renderList(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <DataStorageList />
    </MemoryRouter>
  );
}

describe('DataStorageList promo', () => {
  beforeEach(() => {
    mocks.current = null;
    mocks.failNextFetch = false;
    mocks.configured = true;
    mocks.mcp = true;
    mocks.mounts = 0;
    mocks.unmounts = 0;
    mocks.promoMounts = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps one sheet mounted while a Storage opens and closes', async () => {
    const { unmount } = renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Edit row' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Close sheet' }));
    await waitFor(() => {
      expect(screen.queryByTestId('sheet')).toBeNull();
    });

    expect(mocks.mounts).toBe(1);
    expect(mocks.unmounts).toBe(0);
    unmount();
    expect(mocks.unmounts).toBe(1);
  });

  it('shows the promo for the Storage created by a type pick', async () => {
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'New Storage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick type' }));

    const promo = await screen.findByTestId('promo');
    expectSetupPromo(promo, 'new-storage');
    expect(promo).toHaveAttribute('data-variant', 'section');
  });

  it('shows the maintain block when the fetch after creation failed and the row is opened later', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.failNextFetch = true;
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'New Storage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick type' }));
    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit new row' }));

    expectMaintainPromo(await screen.findByTestId('promo'), 'new-storage');
  });

  it('shows the maintain block when the created and configured Storage is reopened from its row', async () => {
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'New Storage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick type' }));
    expect(await screen.findByTestId('promo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close sheet' }));
    await waitFor(() => {
      expect(screen.queryByTestId('sheet')).toBeNull();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit new row' }));

    expectMaintainPromo(await screen.findByTestId('promo'), 'new-storage');
  });

  it('shows the setup block after a row click on an unconfigured Storage', async () => {
    mocks.configured = false;
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Edit row' }));

    expectSetupPromo(await screen.findByTestId('promo'), 'storage-1');
  });

  it('shows the maintain block after a row click on a configured Storage', async () => {
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Edit row' }));

    const promo = await screen.findByTestId('promo');
    expectMaintainPromo(promo, 'storage-1');
    expect(promo).toHaveAttribute('data-variant', 'section');
    expect(screen.getByTestId('sheet').dataset.hasPromo).toBe('true');
  });

  it('keeps the block it opened with when the Storage becomes configured while the sheet is open', async () => {
    mocks.configured = false;
    const { rerender } = renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Edit row' }));
    expectSetupPromo(await screen.findByTestId('promo'), 'storage-1');
    mocks.configured = true;
    mocks.current = mocks.storage('storage-1');
    rerender(
      <MemoryRouter>
        <DataStorageList />
      </MemoryRouter>
    );

    expectSetupPromo(screen.getByTestId('promo'), 'storage-1');
    expect(mocks.promoMounts).toBe(1);
  });

  it.each([false, true])(
    'passes no promo to the sheet without the setup promo (configured: %s)',
    async configured => {
      mocks.mcp = false;
      mocks.configured = configured;
      renderList();

      fireEvent.click(screen.getByRole('button', { name: 'Edit row' }));

      expect((await screen.findByTestId('sheet')).dataset.hasPromo).toBe('false');
      expect(screen.queryByTestId('promo')).toBeNull();
    }
  );

  it('shows the promo for a deep-linked unconfigured Storage', async () => {
    mocks.configured = false;
    renderList('/?id=storage-1');

    expectSetupPromo(await screen.findByTestId('promo'), 'storage-1');
  });

  it('shows the maintain block for a deep-linked configured Storage', async () => {
    renderList('/?id=storage-1');

    expectMaintainPromo(await screen.findByTestId('promo'), 'storage-1');
  });
});
