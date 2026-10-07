import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { wasErrorToastShown } from '../../../../../app/api';
import { DataStorageType, type DataStorageFormData } from '../../../shared';
import { DataStorageForm } from './DataStorageForm';

vi.mock('react-hot-toast', () => {
  const toastMock = { error: vi.fn(), success: vi.fn() };
  return { default: toastMock, toast: toastMock };
});

vi.mock('../../../../../app/api', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../../app/api')>()),
  wasErrorToastShown: vi.fn(() => false),
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

vi.mock('../../../../../features/google-oauth', () => ({
  GoogleOAuthConnectButton: () => null,
  // No OAuth: the form opens straight on the Service Account tab.
  storageOAuthApi: { getSettings: vi.fn().mockResolvedValue({ available: false }) },
}));

vi.mock('../CopyStorageCredentialsButton', () => ({ CopyStorageCredentialsButton: () => null }));

const initialData = {
  type: DataStorageType.GOOGLE_BIGQUERY,
  title: 'BigQuery',
  config: { projectId: 'my-project', location: 'US' },
  credentials: { serviceAccount: '', credentialId: null },
} as DataStorageFormData;

// Enough for the form to show the saved-key summary, but its private key is broken.
const pastedKey = JSON.stringify({
  type: 'service_account',
  project_id: 'my-project',
  client_id: '1234567890',
  client_email: 'sa@my-project.iam.gserviceaccount.com',
  private_key: 'not-a-pem',
});

const rejectedSave = (fieldErrors: { field: string; message: string }[]) => ({
  response: {
    status: 400,
    data: { message: 'Invalid credentials', errorDetails: { fieldErrors } },
  },
});

// A storage whose saved credentials need no change, so only the owners are edited.
const configuredStorage = {
  ...initialData,
  credentials: { serviceAccount: '', credentialId: '6f1c1b1e-8a43-4c5e-9a39-0d5b3c6f2a10' },
} as DataStorageFormData;

function renderForm(
  onSubmit: (data: DataStorageFormData) => Promise<void>,
  data: DataStorageFormData = initialData
) {
  render(<DataStorageForm initialData={data} onSubmit={onSubmit} onCancel={vi.fn()} />);
}

async function changeOwners() {
  // Ownership starts collapsed; its content mounts only once opened.
  fireEvent.click(await screen.findByRole('button', { name: /ownership/i }));
  fireEvent.click(await screen.findByRole('button', { name: 'Change owners' }));
}

const serviceAccountInput = () =>
  screen.findByPlaceholderText('Paste your service account JSON here or drag & drop the file');

describe('DataStorageForm — a rejected save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wasErrorToastShown).mockReturnValue(false);
    localStorage.clear();
  });

  it('reopens a pasted key the server rejected, keeps its text and focuses it', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(
        rejectedSave([
          {
            field: 'credentials.private_key',
            message: 'private_key must be a valid PEM format private key',
          },
        ])
      );
    renderForm(onSubmit);

    fireEvent.change(await serviceAccountInput(), { target: { value: pastedKey } });
    // A complete-looking key collapses into the summary, where it can be neither seen nor fixed.
    expect(await screen.findByText('sa@my-project.iam.gserviceaccount.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('private_key must be a valid PEM format private key')
    ).toBeInTheDocument();
    const textarea = await serviceAccountInput();
    expect(textarea).toHaveValue(pastedKey);
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => {
      expect(textarea).toHaveFocus();
    });
    // Edit would wipe the key; Cancel restores the saved one.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    // The field's own Cancel, next to the form's.
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports a failure the API interceptor stayed silent on', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSubmit = vi.fn().mockRejectedValue(new Error('Network Error'));
    renderForm(onSubmit, configuredStorage);

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network Error');
    });
    consoleError.mockRestore();
  });

  it('does not repeat a failure the API interceptor already toasted', async () => {
    vi.mocked(wasErrorToastShown).mockReturnValue(true);
    const onSubmit = vi.fn().mockRejectedValue(rejectedSave([]));
    renderForm(onSubmit, configuredStorage);

    await changeOwners();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('sends the owner change again when the user saves after a rejection', async () => {
    vi.mocked(wasErrorToastShown).mockReturnValue(true);
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(rejectedSave([]))
      .mockResolvedValueOnce(undefined);
    renderForm(onSubmit, configuredStorage);

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
