import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { wasErrorToastShown } from '../../../../../app/api';
import { DataDestinationType, type DataDestinationFormData } from '../../../shared';
import { DataDestinationForm } from './DataDestinationForm';

vi.mock('react-hot-toast', () => {
  const toastMock = { error: vi.fn(), success: vi.fn() };
  return { default: toastMock, toast: toastMock };
});

vi.mock('../../../../../app/api', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../../app/api')>()),
  wasErrorToastShown: vi.fn(() => true),
}));

vi.mock('../../../../idp/hooks/useAuthState', () => ({ useUser: () => null }));
vi.mock('../../../../idp/hooks/useRole', () => ({ useIsAdmin: () => false }));
vi.mock('../../../../../features/contexts/hooks/useInlineContextCreate', () => ({
  useInlineContextCreate: () => ({ pickerProps: {}, sheetProps: {} }),
}));
vi.mock('../../../../../features/contexts/components/ContextPicker/ContextPicker', () => ({
  ContextPicker: () => null,
}));
vi.mock('../../../../../features/contexts/components/AddContextSheet/AddContextSheet', () => ({
  AddContextSheet: () => null,
}));
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
vi.mock('../../../../google-oauth', () => ({
  GoogleOAuthConnectButton: () => null,
  // No OAuth: the Sheets fields open on the Service Account tab, where the folder lives.
  destinationOAuthApi: {
    getSettings: vi.fn().mockResolvedValue({ available: false }),
    getCredentialStatus: vi.fn().mockResolvedValue({ isValid: false }),
  },
}));
vi.mock('../CopyDestinationCredentialsButton', () => ({
  CopyDestinationCredentialsButton: () => null,
}));

const savedKey = JSON.stringify({
  type: 'service_account',
  project_id: 'my-project',
  client_id: '1234567890',
  client_email: 'sa@my-project.iam.gserviceaccount.com',
});

const sheetsDestination = {
  type: DataDestinationType.GOOGLE_SHEETS,
  title: 'Sheets',
  credentials: { serviceAccount: savedKey, credentialId: '6f1c1b1e-8a43-4c5e-9a39-0d5b3c6f2a10' },
  config: { folderUrl: 'https://drive.google.com/drive/folders/abc123' },
} as DataDestinationFormData;

const FOLDER_MESSAGE =
  'The folder must be located in a Shared Drive. My Drive folders are not supported for service-account auto-creation.';

function renderForm(onSubmit: (data: DataDestinationFormData) => Promise<void>) {
  render(
    <DataDestinationForm
      initialData={sheetsDestination}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      isEditMode
    />
  );
}

const folderInput = () => screen.findByPlaceholderText('https://drive.google.com/drive/folders/…');

describe('DataDestinationForm — a rejected save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wasErrorToastShown).mockReturnValue(true);
    localStorage.clear();
  });

  it('marks and focuses the Drive folder the service account cannot use', async () => {
    const onSubmit = vi.fn().mockRejectedValue({
      response: {
        status: 400,
        data: { code: 'DESTINATION_FOLDER_ACCESS', message: FOLDER_MESSAGE },
      },
    });
    renderForm(onSubmit);

    fireEvent.change(await folderInput(), {
      target: { value: 'https://drive.google.com/drive/folders/my-drive-folder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(FOLDER_MESSAGE)).toBeInTheDocument();
    const input = await folderInput();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  it('still reports a rejection whose field is not on screen', async () => {
    vi.mocked(wasErrorToastShown).mockReturnValue(false);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSubmit = vi.fn().mockRejectedValue({
      response: {
        status: 422,
        data: {
          message: 'The destination refused this setting',
          errorDetails: {
            fieldErrors: [{ field: 'credentials.deploymentUrl', message: 'Not allowed' }],
          },
        },
      },
    });
    renderForm(onSubmit);

    fireEvent.change(await screen.findByPlaceholderText('Enter title'), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('The destination refused this setting');
    });
    consoleError.mockRestore();
  });

  it('reports a failure the API interceptor stayed silent on', async () => {
    vi.mocked(wasErrorToastShown).mockReturnValue(false);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onSubmit = vi.fn().mockRejectedValue(new Error('Network Error'));
    renderForm(onSubmit);

    fireEvent.change(await screen.findByPlaceholderText('Enter title'), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Network Error');
    });
    consoleError.mockRestore();
  });

  it('sends the owner change again when the user saves after a rejection', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 400, data: { message: 'Bad request' } } })
      .mockResolvedValueOnce(undefined);
    renderForm(onSubmit);

    fireEvent.click(await screen.findByRole('button', { name: /ownership/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Change owners' }));
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
