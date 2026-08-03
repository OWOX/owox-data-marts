import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataDestinationType, useDataDestination } from '../../../shared';
import type { DataDestination } from '../../../shared';
import { DataDestinationConfigSheet } from './DataDestinationConfigSheet';

const authMock = vi.hoisted(() => ({
  value: {
    status: 'authenticated',
    user: { id: 'user-1', projectId: 'project-1', roles: ['admin'] },
    signOut: vi.fn(),
  },
}));

vi.mock('../../../shared', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../shared')>();
  return {
    ...actual,
    useDataDestination: vi.fn(),
  };
});

vi.mock('../../../../idp', () => ({
  useAuth: () => authMock.value,
}));

vi.mock('../DataDestinationEditForm', () => ({
  DataDestinationForm: () => null,
}));

vi.mock('@owox/ui/components/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <aside role='dialog'>{children}</aside>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));

const dataDestination: DataDestination = {
  id: 'destination-1',
  title: '[Ok OAuth] Sheets',
  type: DataDestinationType.GOOGLE_SHEETS,
  projectId: 'project-1',
  credentials: {},
  createdAt: new Date('2026-06-09T10:00:00.000Z'),
  modifiedAt: new Date('2026-06-09T10:00:00.000Z'),
  contexts: [],
};

function renderSheet() {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/data-destinations']}>
      <DataDestinationConfigSheet
        isOpen
        onClose={vi.fn()}
        dataDestination={dataDestination}
        onSaveSuccess={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('DataDestinationConfigSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    vi.mocked(useDataDestination).mockReturnValue({
      dataDestinations: [],
      currentDataDestination: null,
      loading: false,
      error: null,
      fetchDataDestinations: vi.fn(),
      getDataDestinationById: vi.fn(),
      createDataDestination: vi.fn(),
      updateDataDestination: vi.fn(),
      deleteDataDestination: vi.fn(),
      clearCurrentDataDestination: vi.fn(),
      rotateSecretKey: vi.fn(),
    });

    authMock.value = {
      status: 'authenticated',
      user: { id: 'user-1', projectId: 'project-1', roles: ['admin'] },
      signOut: vi.fn(),
    };
  });

  it('copies the project-scoped deep link for the destination', async () => {
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link to this destination' }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/ui/project-1/data-destinations?id=destination-1`
      );
    });
  });

  it('hides the copy link button when no project id is resolvable', () => {
    authMock.value = {
      status: 'authenticated',
      user: { id: 'user-1', projectId: '', roles: ['admin'] },
      signOut: vi.fn(),
    };

    renderSheet();

    expect(screen.queryByRole('button', { name: 'Copy link to this destination' })).toBeNull();
  });
});
