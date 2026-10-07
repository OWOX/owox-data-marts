import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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

// Captures what the sheet hands the form, so a test can drive a save the way the form does.
const formProps = vi.hoisted(() => ({
  current: null as null | { onSubmit: (data: unknown) => Promise<void> },
}));

vi.mock('../DataDestinationEditForm', () => ({
  DataDestinationForm: (props: { onSubmit: (data: unknown) => Promise<void> }) => {
    formProps.current = props;
    return null;
  },
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

function renderSheet({
  onClose = vi.fn(),
  onSaveSuccess = vi.fn(),
  destination = dataDestination,
}: {
  onClose?: () => void;
  onSaveSuccess?: (destination: DataDestination) => void;
  destination?: DataDestination | null;
} = {}) {
  return render(
    <MemoryRouter initialEntries={['/ui/project-1/data-destinations']}>
      <DataDestinationConfigSheet
        isOpen
        onClose={onClose}
        dataDestination={destination}
        onSaveSuccess={onSaveSuccess}
      />
    </MemoryRouter>
  );
}

const sheetsFormData = {
  type: DataDestinationType.GOOGLE_SHEETS,
  title: 'Sheets',
  credentials: { serviceAccount: '', credentialId: null },
};

const rejection = { response: { status: 400, data: { code: 'DESTINATION_FOLDER_ACCESS' } } };

function mockSave(overrides: Partial<ReturnType<typeof useDataDestination>>) {
  vi.mocked(useDataDestination).mockReturnValue({
    ...vi.mocked(useDataDestination)(),
    ...overrides,
  });
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

  // Before, the sheet closed after ANY save, so a rejected one threw the user's values away and
  // left nothing to point at the field to fix.
  it('stays open on a rejected update and passes the failure on to the form', async () => {
    const updateDataDestination = vi.fn().mockRejectedValue(rejection);
    mockSave({ updateDataDestination });
    const onClose = vi.fn();
    const onSaveSuccess = vi.fn();
    renderSheet({ onClose, onSaveSuccess });

    await expect(formProps.current?.onSubmit(sheetsFormData)).rejects.toBe(rejection);

    expect(updateDataDestination).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaveSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('stays open on a rejected create', async () => {
    const createDataDestination = vi.fn().mockRejectedValue(rejection);
    mockSave({ createDataDestination });
    const onClose = vi.fn();
    const onSaveSuccess = vi.fn();
    renderSheet({ onClose, onSaveSuccess, destination: null });

    await expect(formProps.current?.onSubmit(sheetsFormData)).rejects.toBe(rejection);

    expect(createDataDestination).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaveSuccess).not.toHaveBeenCalled();
  });

  it('closes and reports a successful update', async () => {
    const updated = { ...dataDestination, title: 'Renamed' };
    mockSave({ updateDataDestination: vi.fn().mockResolvedValue(updated) });
    const onClose = vi.fn();
    const onSaveSuccess = vi.fn();
    renderSheet({ onClose, onSaveSuccess });

    await formProps.current?.onSubmit(sheetsFormData);

    expect(onClose).toHaveBeenCalled();
    expect(onSaveSuccess).toHaveBeenCalledWith(updated);
  });

  it('treats a fault in the caller after the save as a saved Destination, not a rejected one', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockSave({ updateDataDestination: vi.fn().mockResolvedValue(dataDestination) });
    const onClose = vi.fn();
    renderSheet({
      onClose,
      onSaveSuccess: () => {
        throw new Error('list refresh failed');
      },
    });

    await expect(formProps.current?.onSubmit(sheetsFormData)).resolves.toBeUndefined();

    expect(onClose).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
