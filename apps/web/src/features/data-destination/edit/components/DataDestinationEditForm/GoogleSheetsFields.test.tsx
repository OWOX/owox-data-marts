import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Form } from '@owox/ui/components/form';
import type { Credential } from '../../../../credentials';
import {
  DataDestinationType,
  type DataDestinationFormData,
  type DestinationCredentialSummary,
} from '../../../shared';
import { GoogleSheetsFields } from './GoogleSheetsFields';

vi.mock('../../../../google-oauth', () => ({
  destinationOAuthApi: {
    getSettings: vi.fn().mockResolvedValue({
      available: true,
      clientId: 'client-1',
      pickerApiKey: 'picker-key',
    }),
  },
}));

const openPicker = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../../shared/hooks/useGoogleDrivePicker', () => ({
  useGoogleDrivePicker: () => ({ openPicker }),
}));

vi.mock('../../../../credentials/useCredentials', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../credentials/useCredentials')>()),
  useCredentials: () => ({
    credentials: [
      {
        id: 'sa-1',
        definition: { id: 'google-service-account' },
        identity: 'sa@project.iam.gserviceaccount.com',
      },
      { id: 'oauth-1', definition: { id: 'google-sheets-oauth' }, identity: 'me@example.com' },
    ],
    isLoading: false,
    isError: false,
  }),
}));

const FOLDER_URL = 'https://drive.google.com/drive/folders/abc123';
const folderUrlInput = () =>
  screen.queryByPlaceholderText('https://drive.google.com/drive/folders/…');

function TestForm({
  credentialId,
  folderUrl,
  summary = null,
  created = null,
}: {
  credentialId: string;
  folderUrl?: string;
  summary?: DestinationCredentialSummary | null;
  created?: Credential | null;
}) {
  const form = useForm<DataDestinationFormData>({
    defaultValues: {
      title: 'Sheets',
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: credentialId,
      config: folderUrl ? { folderUrl } : undefined,
    },
  });
  return (
    <Form {...form}>
      <GoogleSheetsFields form={form} credentialField={null} summary={summary} created={created} />
    </Form>
  );
}

describe('GoogleSheetsFields', () => {
  beforeEach(() => {
    openPicker.mockClear();
  });

  it('asks a service account Credential for a Shared Drive folder URL', async () => {
    render(<TestForm credentialId='sa-1' />);

    expect(
      await screen.findByText('Drive folder for auto-created documents (required)')
    ).toBeInTheDocument();
    expect(folderUrlInput()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose folder' })).not.toBeInTheDocument();
  });

  it('offers a Google account Credential the folder picker, hinted with its email', async () => {
    render(<TestForm credentialId='oauth-1' />);

    fireEvent.click(await screen.findByRole('button', { name: 'Choose folder' }));

    expect(openPicker).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'picker-key', hintEmail: 'me@example.com' })
    );
    expect(folderUrlInput()).not.toBeInTheDocument();
  });

  it('shows no folder input until a Credential is selected', async () => {
    render(<TestForm credentialId='' />);

    expect(await screen.findByText('Authentication')).toBeInTheDocument();
    expect(folderUrlInput()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose folder' })).not.toBeInTheDocument();
  });

  it('shows a static Authentication header, not a collapsible section', async () => {
    render(<TestForm credentialId='' />);

    expect(await screen.findByText('Authentication')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Authentication/ })).not.toBeInTheDocument();
  });

  it('follows the provider of a bound Credential that the list does not hold', async () => {
    render(
      <TestForm
        credentialId='bound-1'
        summary={{
          access: 'visible',
          id: 'bound-1',
          title: 'Old key',
          definitionId: 'google-service-account',
          providerName: 'Google Service Account',
          identity: null,
          state: 'disabled',
        }}
      />
    );

    expect(
      await screen.findByText('Drive folder for auto-created documents (required)')
    ).toBeInTheDocument();
  });

  it('asks a just-created service account Credential for a folder before the list has it', async () => {
    render(
      <TestForm
        credentialId='new-1'
        created={
          {
            id: 'new-1',
            definition: { id: 'google-service-account' },
            identity: 'new@project.iam.gserviceaccount.com',
          } as Credential
        }
      />
    );

    expect(
      await screen.findByText('Drive folder for auto-created documents (required)')
    ).toBeInTheDocument();
  });

  it.each([
    [FOLDER_URL, true],
    [undefined, false],
  ])(
    'keeps the folder URL of a Destination whose Credential the member cannot see (%s)',
    async (folderUrl, shown) => {
      render(
        <TestForm
          credentialId=''
          folderUrl={folderUrl}
          summary={{ access: 'restricted', state: 'ready' }}
        />
      );

      await screen.findByText('Authentication');
      if (shown) {
        expect(folderUrlInput()).toHaveValue(FOLDER_URL);
      } else {
        expect(folderUrlInput()).not.toBeInTheDocument();
      }
    }
  );

  it('offers the folder picker for a Google account Credential the member cannot see', async () => {
    render(
      <TestForm
        credentialId=''
        summary={{
          access: 'restricted',
          state: 'ready',
          definitionId: 'google-sheets-oauth',
          identity: 'owner@example.com',
        }}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Choose folder' }));

    expect(openPicker).toHaveBeenCalledWith(
      expect.objectContaining({ hintEmail: 'owner@example.com' })
    );
    expect(folderUrlInput()).not.toBeInTheDocument();
  });

  it('lets a Destination on its own service account key add a folder without selecting a Credential', async () => {
    render(
      <TestForm
        credentialId=''
        summary={{ access: 'pending', state: 'ready', definitionId: 'google-service-account' }}
      />
    );

    expect(
      await screen.findByText('Drive folder for auto-created documents (required)')
    ).toBeInTheDocument();
    expect(folderUrlInput()).toHaveValue('');
  });
});
