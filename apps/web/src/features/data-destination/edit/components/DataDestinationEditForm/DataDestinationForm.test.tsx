// @vitest-environment happy-dom
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CredentialSummary } from '../../../../credentials';
import {
  DataDestinationType,
  type DataDestination,
  type DataDestinationFormData,
} from '../../../shared';
import { GoogleChatMapper } from '../../../shared/model/mappers/google-chat.mapper';
import { GoogleSheetsMapper } from '../../../shared/model/mappers/google-sheets.mapper';
import { DataDestinationForm } from './DataDestinationForm';

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
  OwnersSection: () => null,
}));
vi.mock('../../../../google-oauth', () => ({
  destinationOAuthApi: { getSettings: vi.fn().mockResolvedValue({ available: false }) },
}));

const credentials = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('../../../../credentials/useCredentials', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../credentials/useCredentials')>()),
  useCredentials: () => ({
    credentials: credentials.list,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCredentialDefinitions: () => ({
    definitions: [
      { id: 'google-service-account', destinationTypes: ['GOOGLE_SHEETS'] },
      { id: 'google-chat-webhook', destinationTypes: ['GOOGLE_CHAT'] },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../../../../credentials/components/CredentialConfigSheet', () => ({
  CredentialConfigSheet: () => null,
}));

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../../../utils/data-layer', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args) as unknown,
}));

function credential(id: string, definitionId: string) {
  return {
    id,
    title: id,
    definition: { id: definitionId, displayName: definitionId },
    enabled: true,
    canUse: true,
    identity: null,
  };
}

const visibleWebhook: CredentialSummary = {
  access: 'visible',
  id: 'hook-1',
  title: 'Team space',
  definitionId: 'google-chat-webhook',
  providerName: 'Google Chat webhook',
  identity: null,
  state: 'ready',
};

function destination(overrides: Partial<DataDestination>): DataDestination {
  return {
    id: 'destination-1',
    title: 'Destination',
    projectId: 'project-1',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    modifiedAt: new Date('2026-10-01T00:00:00Z'),
    contexts: [],
    ...overrides,
  } as DataDestination;
}

function renderForm(initialData: DataDestination | null, isEditMode = initialData !== null) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onDirtyChange = vi.fn();
  render(
    <DataDestinationForm
      initialData={initialData}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      onDirtyChange={onDirtyChange}
      isEditMode={isEditMode}
      destinationId={initialData?.id}
    />
  );
  return { onSubmit, onDirtyChange };
}

async function save(onSubmit: ReturnType<typeof vi.fn>) {
  // The Credential list closes a frame after a choice; until then the rest of the page is hidden.
  fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  return onSubmit.mock.calls[0][0] as Record<string, unknown>;
}

const selectedEvents = () =>
  trackEvent.mock.calls.filter(([event]) => event.event === 'destination_credential_selected');

describe('DataDestinationForm', () => {
  // Excel needs no credentials, so a pre-filled Excel form is valid the moment it opens.
  const prefilledExcel = { title: 'New Destination', type: DataDestinationType.EXCEL as const };

  beforeEach(() => {
    credentials.list = [];
    trackEvent.mockClear();
  });

  it('enables Save on a valid pre-filled form in create mode', () => {
    render(
      <DataDestinationForm
        initialData={prefilledExcel}
        isEditMode={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('keeps Save disabled in edit mode until something changes', () => {
    render(
      <DataDestinationForm
        initialData={prefilledExcel}
        isEditMode
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('creates a Google Sheets Destination with the only fitting Credential, not dirtied by it', async () => {
    credentials.list = [credential('sa-1', 'google-service-account')];
    const { onSubmit, onDirtyChange } = renderForm(null);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent('sa-1');
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    const payload = await save(onSubmit);
    expect(payload).toMatchObject({
      type: DataDestinationType.GOOGLE_SHEETS,
      reusableCredentialId: 'sa-1',
    });
    expect(selectedEvents()).toEqual([
      [
        {
          event: 'destination_credential_selected',
          category: 'DataDestination',
          action: 'auto',
          label: DataDestinationType.GOOGLE_SHEETS,
          context: null,
          value: null,
        },
      ],
    ]);
  });

  it('creates a Google Chat Destination with its only webhook Credential', async () => {
    credentials.list = [credential('hook-1', 'google-chat-webhook')];
    const { onSubmit } = renderForm(null);

    // The title first: a later change would recount every field as dirty.
    fireEvent.change(screen.getByPlaceholderText('Enter title'), {
      target: { value: 'Team chat' },
    });
    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Destination Type' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await within(document.body).findByRole('option', { name: /Google Chat/ }));
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent('hook-1');
    });
    const payload = await save(onSubmit);

    expect(
      new GoogleChatMapper().mapToCreateRequest(payload as unknown as DataDestinationFormData)
    ).toEqual({
      title: 'Team chat',
      type: DataDestinationType.GOOGLE_CHAT,
      reusableCredentialId: 'hook-1',
    });
  });

  it('asks for a Credential before creating a Google Sheets Destination', async () => {
    const { onSubmit } = renderForm(null);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Select a Credential')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves a Destination whose Credential the member cannot see without touching it', async () => {
    const { onSubmit } = renderForm(
      destination({
        type: DataDestinationType.GOOGLE_SHEETS,
        credentials: {},
        reusableCredential: { access: 'restricted', state: 'ready' },
      })
    );

    expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent(
      'Restricted Credential'
    );
    fireEvent.change(screen.getByPlaceholderText('Enter title'), { target: { value: 'Renamed' } });
    const payload = await save(onSubmit);

    expect(payload.title).toBe('Renamed');
    expect(payload).not.toHaveProperty('reusableCredentialId');
    expect(selectedEvents()).toEqual([]);
  });

  it('switches a Google Chat webhook Destination to email recipients without its Credential', async () => {
    credentials.list = [credential('hook-1', 'google-chat-webhook')];
    const { onSubmit } = renderForm(
      destination({
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'webhook' },
        reusableCredential: visibleWebhook,
      })
    );

    expect(screen.getByRole('tab', { name: 'Incoming Webhook' })).toHaveAttribute(
      'data-state',
      'active'
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Channel Email' }), { button: 0 });
    const recipients = await screen.findByPlaceholderText(
      'Enter emails separated by comma, semicolon or newline'
    );
    fireEvent.change(recipients, { target: { value: 'space@example.com' } });
    fireEvent.blur(recipients);
    const payload = await save(onSubmit);

    expect(payload.credentials).toEqual({ deliveryMethod: 'email', to: ['space@example.com'] });
    expect(payload).not.toHaveProperty('reusableCredentialId');
    expect(selectedEvents()).toEqual([]);
  });

  it('switches a Google Chat email Destination to a webhook Credential', async () => {
    credentials.list = [
      credential('hook-1', 'google-chat-webhook'),
      credential('hook-2', 'google-chat-webhook'),
    ];
    const { onSubmit } = renderForm(
      destination({
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'email', to: ['space@example.com'] },
      })
    );

    expect(screen.getByRole('tab', { name: 'Channel Email' })).toHaveAttribute(
      'data-state',
      'active'
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Incoming Webhook' }), { button: 0 });
    fireEvent.click(await screen.findByRole('combobox', { name: 'Credential' }));
    fireEvent.click(await within(document.body).findByRole('option', { name: /hook-2/ }));
    const payload = await save(onSubmit);

    expect(payload).toMatchObject({
      credentials: { deliveryMethod: 'webhook' },
      reusableCredentialId: 'hook-2',
    });
    expect(selectedEvents()[0][0]).toMatchObject({
      action: 'existing',
      label: DataDestinationType.GOOGLE_CHAT,
    });
  });

  it('clears the Drive folder when another Google Sheets Credential is selected', async () => {
    credentials.list = [
      credential('sa-1', 'google-service-account'),
      credential('sa-2', 'google-service-account'),
    ];
    const { onSubmit } = renderForm(
      destination({
        type: DataDestinationType.GOOGLE_SHEETS,
        credentials: {},
        config: { folderUrl: 'https://drive.google.com/drive/folders/abc123' },
        reusableCredential: {
          access: 'visible',
          id: 'sa-1',
          title: 'sa-1',
          definitionId: 'google-service-account',
          providerName: 'Google Service Account',
          identity: null,
          state: 'ready',
        },
      })
    );
    const folder = screen.getByPlaceholderText('https://drive.google.com/drive/folders/…');
    expect(folder).toHaveValue('https://drive.google.com/drive/folders/abc123');

    fireEvent.click(screen.getByRole('combobox', { name: 'Credential' }));
    fireEvent.click(await within(document.body).findByRole('option', { name: /sa-2/ }));

    expect(folder).toHaveValue('');
    const payload = await save(onSubmit);
    expect(payload).toMatchObject({ reusableCredentialId: 'sa-2' });
    expect(
      new GoogleSheetsMapper().mapToUpdateRequest(payload as Partial<DataDestinationFormData>)
    ).toEqual({ title: 'Destination', reusableCredentialId: 'sa-2', config: { folderUrl: null } });
  });

  it('does not pick a Credential for an existing Destination whose Credential is gone', async () => {
    credentials.list = [credential('sa-1', 'google-service-account')];
    const { onSubmit } = renderForm(
      destination({
        type: DataDestinationType.GOOGLE_SHEETS,
        credentials: {},
        reusableCredential: null,
      })
    );

    const field = screen.getByRole('combobox', { name: 'Credential' });
    expect(field).toHaveTextContent('Select a Credential');
    fireEvent.change(screen.getByPlaceholderText('Enter title'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(field).toHaveAttribute('aria-invalid', 'true');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    [
      'Google Sheets',
      {
        type: DataDestinationType.GOOGLE_SHEETS,
        credentials: {},
        reusableCredential: {
          access: 'pending',
          state: 'ready',
          definitionId: 'google-service-account',
          identity: 'sa@project.iam.gserviceaccount.com',
        },
      },
      'google-service-account',
    ],
    [
      'Google Chat webhook',
      {
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'webhook' },
        reusableCredential: { access: 'pending', state: 'ready' },
      },
      'google-chat-webhook',
    ],
  ] as const)(
    'renames a %s Destination on its own key without selecting a Credential',
    async (_, overrides, definitionId) => {
      credentials.list = [credential('only', definitionId)];
      const { onSubmit } = renderForm(destination(overrides as Partial<DataDestination>));

      expect(
        screen.getByText('Uses its own key until you select a Credential')
      ).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText('Enter title'), {
        target: { value: 'Renamed' },
      });
      const payload = await save(onSubmit);

      expect(payload.title).toBe('Renamed');
      expect(payload).not.toHaveProperty('reusableCredentialId');
      expect(selectedEvents()).toEqual([]);
    }
  );

  it('asks for a Credential when a Google Chat email Destination switches to a webhook', async () => {
    credentials.list = [credential('hook-1', 'google-chat-webhook')];
    const { onSubmit } = renderForm(
      destination({
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: { deliveryMethod: 'email', to: ['space@example.com'] },
      })
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Incoming Webhook' }), { button: 0 });
    const field = await screen.findByRole('combobox', { name: 'Credential' });
    expect(field).toHaveTextContent('Select a Credential');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(field).toHaveAttribute('aria-invalid', 'true');
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([DataDestinationType.EMAIL, DataDestinationType.SLACK, DataDestinationType.MS_TEAMS])(
    'creates a Destination of type %s with its recipients and no Credential field',
    async type => {
      const { onSubmit } = renderForm(
        { title: 'Recipients', type, credentials: { to: ['team@example.com'] } } as DataDestination,
        false
      );

      expect(screen.queryByRole('combobox', { name: 'Credential' })).not.toBeInTheDocument();
      const payload = await save(onSubmit);

      expect(payload).toMatchObject({ type, credentials: { to: ['team@example.com'] } });
      expect(payload).not.toHaveProperty('reusableCredentialId');
    }
  );
});
