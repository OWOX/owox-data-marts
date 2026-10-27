import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { wasErrorToastShown } from '../../../../../app/api';
import { DataStorageType, type StorageCredentialSummary } from '../../../shared';
import type { DataStorage } from '../../../shared/model/types/data-storage';
import { DataStorageForm } from './DataStorageForm';

vi.mock('react-hot-toast', () => {
  const toastMock = { error: vi.fn(), success: vi.fn() };
  return { default: toastMock, toast: toastMock };
});

vi.mock('../../../../../app/api', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../../app/api')>()),
  wasErrorToastShown: vi.fn(() => false),
}));

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../../../utils/data-layer', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args) as unknown,
}));

vi.mock('../../../../idp/hooks/useAuthState', () => ({
  useUser: () => ({ id: 'user-1', fullName: 'Admin', email: 'admin@example.com', avatar: null }),
}));

vi.mock('../../../../idp/hooks/useRole', () => ({ useIsAdmin: () => false }));

vi.mock('../../../../../shared/components/OwnersSection/OwnersSection', () => ({
  OwnersSection: ({ onSave }: { onSave: (owners: unknown[]) => void }) => (
    <button
      type='button'
      onClick={() => {
        onSave([{ userId: 'user-2', fullName: 'Owner', email: 'owner@example.com', avatar: null }]);
      }}
    >
      Change owners
    </button>
  ),
}));

vi.mock('../../../../../features/contexts/components/ContextPicker/ContextPicker', () => ({
  ContextPicker: () => null,
}));

vi.mock('../../../../../features/contexts/components/AddContextSheet/AddContextSheet', () => ({
  AddContextSheet: () => null,
}));

vi.mock('../../../../../features/contexts/hooks/useInlineContextCreate', () => ({
  useInlineContextCreate: () => ({ pickerProps: {}, sheetProps: {} }),
}));

vi.mock('../../../shared/components/DataStorageHealthIndicator/DataStorageHealthIndicator', () => ({
  DataStorageHealthIndicator: () => null,
}));

const fieldProps = vi.hoisted(() => ({
  isNew: undefined as boolean | undefined,
  // The real field, on the Credentials below, for the cases that need its own behaviour.
  real: false,
  credentials: [] as unknown[],
}));

vi.mock('../../../../credentials/useCredentials', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../credentials/useCredentials')>()),
  useCredentials: () => ({
    credentials: fieldProps.credentials,
    isLoading: false,
    isError: false,
    refetch: () => undefined,
  }),
  useCredentialDefinitions: () => ({
    definitions: [{ id: 'google-service-account', storageTypes: ['GOOGLE_BIGQUERY'] }],
    isLoading: false,
    isError: false,
    refetch: () => undefined,
  }),
}));

vi.mock('../../../../credentials/components/CredentialConfigSheet', () => ({
  CredentialConfigSheet: () => null,
}));

// The field has its own spec; this stub reports a choice and shows the props the form hands it.
vi.mock('../../../../credentials/components/ConsumerCredentialField', async importOriginal => {
  const actual =
    await importOriginal<
      typeof import('../../../../credentials/components/ConsumerCredentialField')
    >();
  return {
    ...actual,
    ConsumerCredentialField: (props: Parameters<typeof actual.ConsumerCredentialField>[0]) => {
      fieldProps.isNew = props.isNew;
      if (fieldProps.real) return <actual.ConsumerCredentialField {...props} />;
      return <FieldStub {...props} />;
    },
  };
});

function FieldStub({
  onChange,
  value,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  onChange: (id: string, source: 'existing' | 'created' | 'auto') => void;
  value: string | null;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  return (
    <>
      <input
        readOnly
        id={id}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        value={value ?? ''}
      />
      <button
        type='button'
        onClick={() => {
          onChange('cred-2', 'existing');
        }}
      >
        Pick another Credential
      </button>
      <button
        type='button'
        onClick={() => {
          onChange('cred-auto', 'auto');
        }}
      >
        Pick automatically
      </button>
    </>
  );
}

const boundSummary: StorageCredentialSummary = {
  access: 'visible',
  id: 'cred-1',
  title: 'Analytics key',
  definitionId: 'google-service-account',
  providerName: 'BigQuery Service Account',
  identity: 'sa@my-project.iam.gserviceaccount.com',
  state: 'ready',
};

function storage(reusableCredential: StorageCredentialSummary | null = boundSummary): DataStorage {
  return {
    id: 'storage-1',
    type: DataStorageType.GOOGLE_BIGQUERY,
    title: 'BigQuery',
    config: { projectId: 'my-project', location: 'US' },
    createdAt: new Date('2026-06-09T10:00:00.000Z'),
    modifiedAt: new Date('2026-06-09T10:00:00.000Z'),
    reusableCredential,
  };
}

function renderForm(onSubmit: (data: unknown) => Promise<void>, data: DataStorage = storage()) {
  render(<DataStorageForm initialData={data} onSubmit={onSubmit} onCancel={vi.fn()} />);
}

async function changeOwners() {
  // Ownership starts collapsed; its content mounts only once opened.
  fireEvent.click(await screen.findByRole('button', { name: /ownership/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Change owners' }));
}

const submitted = (onSubmit: ReturnType<typeof vi.fn>) =>
  onSubmit.mock.calls[0][0] as Record<string, unknown>;

const rejectedSave = { response: { status: 400, data: { message: 'Invalid config' } } };

describe('DataStorageForm — Credential', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wasErrorToastShown).mockReturnValue(false);
    localStorage.clear();
  });

  it('keeps the binding and sends no keys when the Credential did not change', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(submitted(onSubmit)).not.toHaveProperty('reusableCredentialId');
    expect(submitted(onSubmit)).not.toHaveProperty('credentials');
    expect(trackEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'storage_credential_selected' })
    );
  });

  it('sends the selected Credential and reports how it was chosen', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit);

    fireEvent.click(await screen.findByRole('button', { name: 'Pick another Credential' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(submitted(onSubmit).reusableCredentialId).toBe('cred-2');
    expect(submitted(onSubmit)).not.toHaveProperty('credentials');
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'storage_credential_selected',
      category: 'DataStorage',
      action: 'existing',
      label: DataStorageType.GOOGLE_BIGQUERY,
      context: null,
      value: null,
    });
  });

  it('does not report a selection the server rejected', async () => {
    vi.mocked(wasErrorToastShown).mockReturnValue(true);
    const onSubmit = vi.fn().mockRejectedValue(rejectedSave);
    renderForm(onSubmit);

    fireEvent.click(await screen.findByRole('button', { name: 'Pick another Credential' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(trackEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'storage_credential_selected' })
    );
  });

  it('saves a Storage whose Credential the member cannot see without choosing another', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit, storage({ access: 'restricted', state: 'ready' }));

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(submitted(onSubmit)).not.toHaveProperty('reusableCredentialId');
  });

  it('asks for a Credential when the Storage has none', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit, storage(null));

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Select a Credential')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('marks the Credential field as the one to fix and moves focus to it', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit, storage(null));

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const control = await screen.findByLabelText('Credential', { selector: 'input' });
    await waitFor(() => {
      expect(control).toHaveAttribute('aria-invalid', 'true');
    });
    expect(control).toHaveAccessibleDescription('Select a Credential');
    await waitFor(() => {
      expect(control).toHaveFocus();
    });
  });

  it('marks the Credential field when the server rejects the Credential', async () => {
    vi.mocked(wasErrorToastShown).mockReturnValue(true);
    const onSubmit = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: 'Invalid credentials',
          errorDetails: {
            fieldErrors: [{ field: 'credentials.private_key', message: 'Not a valid key' }],
          },
        },
      },
    });
    renderForm(onSubmit);

    fireEvent.click(await screen.findByRole('button', { name: 'Pick another Credential' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('private_key: Not a valid key')).toBeInTheDocument();
    expect(screen.getByLabelText('Credential', { selector: 'input' })).toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });

  describe('on a Storage still on its own key', () => {
    const ownKeyHint = 'Uses its own key until you select a Credential';
    const onOwnKey = () => storage({ access: 'pending', state: 'ready' });

    it('leaves the Credential empty, with a hint, instead of picking one', () => {
      renderForm(vi.fn(), onOwnKey());

      expect(fieldProps.isNew).toBe(false);
      expect(
        screen.getByLabelText('Credential', { selector: 'input' })
      ).toHaveAccessibleDescription(ownKeyHint);
    });

    it('saves a title change without a Credential', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm(onSubmit, onOwnKey());

      fireEvent.change(screen.getByPlaceholderText('Storage title'), {
        target: { value: 'Renamed' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });
      expect(submitted(onSubmit)).toMatchObject({ title: 'Renamed' });
      expect(submitted(onSubmit)).not.toHaveProperty('reusableCredentialId');
    });

    it('sends a Credential the member picks', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm(onSubmit, onOwnKey());

      fireEvent.click(await screen.findByRole('button', { name: 'Pick another Credential' }));
      expect(screen.queryByText(ownKeyHint)).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });
      expect(submitted(onSubmit).reusableCredentialId).toBe('cred-2');
    });
  });

  describe('with the real Credential field', () => {
    beforeEach(() => {
      fieldProps.real = true;
    });

    afterEach(() => {
      fieldProps.real = false;
      fieldProps.credentials = [];
    });

    it.each([
      [0, 'No Credentials yet'],
      [2, 'Select a Credential'],
    ])(
      'saves a Storage still on its own key with %i fitting Credentials without picking one',
      async (count, placeholder) => {
        fieldProps.credentials = Array.from({ length: count }, (_, index) => ({
          id: `cred-${String(index)}`,
          title: `Key ${String(index)}`,
          definition: { id: 'google-service-account', displayName: 'BigQuery Service Account' },
          enabled: true,
          canUse: true,
          identity: null,
        }));
        const onSubmit = vi.fn().mockResolvedValue(undefined);
        renderForm(onSubmit, storage({ access: 'pending', state: 'ready' }));

        expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent(placeholder);
        fireEvent.change(screen.getByPlaceholderText('Storage title'), {
          target: { value: 'Renamed' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
          expect(onSubmit).toHaveBeenCalled();
        });
        expect(submitted(onSubmit)).not.toHaveProperty('reusableCredentialId');
      }
    );
  });

  it('picks automatically only for a Storage with neither a Credential nor its own key', () => {
    renderForm(vi.fn(), storage(null));

    expect(fieldProps.isNew).toBe(true);
    expect(screen.queryByText('Uses its own key until you select a Credential')).toBeNull();
  });

  it('does not count the automatic pick as a change, and reports it when the Storage is saved', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm(onSubmit, storage(null));

    fireEvent.click(await screen.findByRole('button', { name: 'Pick automatically' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(submitted(onSubmit).reusableCredentialId).toBe('cred-auto');
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'storage_credential_selected',
      category: 'DataStorage',
      action: 'auto',
      label: DataStorageType.GOOGLE_BIGQUERY,
      context: null,
      value: null,
    });
  });

  it('stays clean when the copy it was opened with is replaced by one without contexts', () => {
    // A Data Mart embeds its Storage without contexts; the sheet shows that copy while it closes.
    const loaded: DataStorage = {
      ...storage(),
      availableForUse: false,
      availableForMaintenance: false,
      contexts: [{ id: 'ctx-1', name: 'Marketing' }],
    };
    const onDirtyChange = vi.fn();
    const { rerender } = render(
      <DataStorageForm
        initialData={loaded}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onDirtyChange={onDirtyChange}
      />
    );

    rerender(
      <DataStorageForm
        initialData={{ ...storage(), contexts: [] }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onDirtyChange={onDirtyChange}
      />
    );

    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });

  it('shows the server message when a tab from before the upgrade saves', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSubmit = vi.fn().mockRejectedValue({
      response: { status: 400, data: { message: 'This page is out of date. Reload it.' } },
    });
    renderForm(onSubmit);

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('This page is out of date. Reload it.');
    });
    consoleError.mockRestore();
  });
});

describe('DataStorageForm — a rejected save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wasErrorToastShown).mockReturnValue(false);
    localStorage.clear();
  });

  it('reports a failure the API interceptor stayed silent on', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSubmit = vi.fn().mockRejectedValue(new Error('Network Error'));
    renderForm(onSubmit);

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network Error');
    });
    consoleError.mockRestore();
  });

  it('still reports a rejection whose field is not on screen', async () => {
    const onSubmit = vi.fn().mockRejectedValue({
      response: {
        status: 422,
        data: {
          message: 'The storage refused this setting',
          errorDetails: {
            fieldErrors: [{ field: 'config.unknownSetting', message: 'Not allowed' }],
          },
        },
      },
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderForm(onSubmit);

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('The storage refused this setting');
    });
    consoleError.mockRestore();
  });

  it('does not repeat a failure the API interceptor already toasted', async () => {
    vi.mocked(wasErrorToastShown).mockReturnValue(true);
    const onSubmit = vi.fn().mockRejectedValue(rejectedSave);
    renderForm(onSubmit);

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('sends the owner change again when the user saves after a rejection', async () => {
    vi.mocked(wasErrorToastShown).mockReturnValue(true);
    const onSubmit = vi.fn().mockRejectedValueOnce(rejectedSave).mockResolvedValueOnce(undefined);
    renderForm(onSubmit);

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    for (const [payload] of onSubmit.mock.calls as [Record<string, unknown>][]) {
      expect(payload.ownerIds).toEqual(['user-2']);
    }
  });
});
