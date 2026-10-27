import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Credential, CredentialSummary } from '../types';
import type { CredentialConfigSheetProps } from './CredentialConfigSheet';
import { ConsumerCredentialField } from './ConsumerCredentialField';

const credentialsState = vi.hoisted(() => ({
  credentials: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const definitionsState = vi.hoisted(() => ({
  definitions: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const sheet = vi.hoisted(() => ({ props: null as null | CredentialConfigSheetProps }));
// The real state mark, plus the summaries the field hands it as the binding it keeps.
const stateMark = vi.hoisted(() => ({ summaries: [] as unknown[] }));

vi.mock('./CredentialStateMark', async importOriginal => {
  const actual = await importOriginal<typeof import('./CredentialStateMark')>();
  return {
    CredentialStateMark: (props: { summary: CredentialSummary | null }) => {
      stateMark.summaries.push(props.summary);
      return <actual.CredentialStateMark {...props} />;
    },
  };
});
const trackEvent = vi.hoisted(() => vi.fn());

vi.mock('../useCredentials', async importOriginal => ({
  ...(await importOriginal<typeof import('../useCredentials')>()),
  useCredentials: () => credentialsState,
  useCredentialDefinitions: () => definitionsState,
}));

vi.mock('./CredentialConfigSheet', () => ({
  CredentialConfigSheet: (props: CredentialConfigSheetProps) => {
    sheet.props = props;
    return createPortal(
      <form
        onSubmit={event => {
          event.preventDefault();
        }}
      >
        <button type='submit'>Save Credential</button>
      </form>,
      document.body
    );
  },
}));

vi.mock('../../../utils/data-layer', () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args) as unknown,
}));

function credential(overrides: Partial<Credential> & { definitionId?: string } = {}): Credential {
  const { definitionId = 'google-service-account', ...rest } = overrides;
  return {
    id: 'cred-1',
    title: 'Analytics key',
    definition: { id: definitionId, displayName: 'BigQuery Service Account' },
    enabled: true,
    canUse: true,
    identity: 'sa@project.iam.gserviceaccount.com',
    ...rest,
  } as Credential;
}

function renderField(
  props: Partial<Parameters<typeof ConsumerCredentialField>[0]> = {},
  onChange = vi.fn()
) {
  render(
    <ConsumerCredentialField
      consumer='storage'
      consumerType='GOOGLE_BIGQUERY'
      isNew={false}
      value={null}
      summary={null}
      onChange={onChange}
      {...props}
    />
  );
  return onChange;
}

async function openOptions() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Credential' }));
  return within(document.body).findAllByRole('option');
}

const visibleSummary: CredentialSummary = {
  access: 'visible',
  id: 'cred-1',
  title: 'Analytics key',
  definitionId: 'google-service-account',
  providerName: 'BigQuery Service Account',
  identity: 'sa@project.iam.gserviceaccount.com',
  state: 'ready',
};

describe('ConsumerCredentialField', () => {
  beforeEach(() => {
    credentialsState.credentials = [];
    credentialsState.isLoading = false;
    credentialsState.isError = false;
    credentialsState.refetch = vi.fn();
    definitionsState.definitions = [
      { id: 'google-service-account', storageTypes: ['GOOGLE_BIGQUERY', 'LEGACY_GOOGLE_BIGQUERY'] },
      { id: 'google-oauth', storageTypes: ['GOOGLE_BIGQUERY', 'LEGACY_GOOGLE_BIGQUERY'] },
      { id: 'aws-access-key', storageTypes: ['AWS_ATHENA', 'AWS_REDSHIFT'] },
      { id: 'databricks-token', storageTypes: ['DATABRICKS'] },
      { id: 'github', storageTypes: [] },
    ];
    definitionsState.isLoading = false;
    definitionsState.isError = false;
    definitionsState.refetch = vi.fn();
    sheet.props = null;
    stateMark.summaries = [];
    trackEvent.mockReset();
  });

  it('shows the provider icon of each Credential and of the selected one', async () => {
    credentialsState.credentials = [
      credential({
        definition: {
          id: 'google-service-account',
          displayName: 'BigQuery Service Account',
          icon: 'google',
        } as Credential['definition'],
      }),
      credential({ id: 'cred-2', title: 'Other key', definitionId: 'google-oauth' }),
    ];
    renderField({ value: 'cred-1' });

    const trigger = screen.getByRole('combobox', { name: 'Credential' });
    expect(trigger.querySelector('svg[width="16"]:not(.lucide-key-round)')).not.toBeNull();
    const [withIcon, withoutIcon] = await openOptions();
    expect(withIcon.querySelector('svg[width="16"]')).not.toHaveClass('lucide-key-round');
    expect(withoutIcon.querySelector('svg[width="16"]')).toHaveClass('lucide-key-round');
  });

  it('offers nothing to create before the definitions load', () => {
    definitionsState.isLoading = true;
    renderField();

    expect(screen.getByRole('combobox', { name: 'Credential' })).toBeDisabled();
    expect(sheet.props).toBeNull();
  });

  it('says the definitions failed and retries them', () => {
    definitionsState.isError = true;
    renderField();

    expect(screen.getByRole('combobox', { name: 'Credential' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(definitionsState.refetch).toHaveBeenCalled();
  });

  it('finds fitting providers by the storage types the definitions name', async () => {
    credentialsState.credentials = [
      credential({ id: 'a', title: 'Key', definitionId: 'aws-access-key' }),
      credential({ id: 'b', title: 'Other', definitionId: 'unknown-provider' }),
    ];
    renderField({ consumerType: 'AWS_ATHENA' });

    expect((await openOptions()).map(option => option.textContent)).toEqual([
      expect.stringContaining('Key'),
      '+ Create new Credential',
    ]);
  });

  it('offers only enabled Credentials of a fitting provider that the member can use', async () => {
    credentialsState.credentials = [
      credential({ id: 'fits', title: 'Fits' }),
      credential({ id: 'oauth', title: 'Google account', definitionId: 'google-oauth' }),
      credential({ id: 'older-backend', title: 'No canUse yet', canUse: undefined }),
      credential({ id: 'disabled', title: 'Disabled', enabled: false }),
      credential({ id: 'see-only', title: 'Seen without use', canUse: false }),
      credential({ id: 'aws', title: 'AWS', definitionId: 'aws-access-key' }),
    ];
    renderField();

    const names = (await openOptions()).map(option => option.textContent);

    expect(names).toEqual([
      expect.stringContaining('Fits'),
      expect.stringContaining('Google account'),
      expect.stringContaining('No canUse yet'),
      '+ Create new Credential',
    ]);
  });

  it('shows title, identity and provider for each Credential', async () => {
    credentialsState.credentials = [credential()];
    renderField();

    const [item] = await openOptions();

    expect(item).toHaveTextContent('Analytics key');
    expect(item).toHaveTextContent('sa@project.iam.gserviceaccount.com');
    expect(item).toHaveTextContent('BigQuery Service Account');
  });

  it('selects the only fitting Credential on a Storage with neither a Credential nor its own key', () => {
    credentialsState.credentials = [credential({ id: 'only' })];
    const onChange = renderField({ isNew: true });

    expect(onChange).toHaveBeenCalledWith('only', 'auto');
  });

  it('leaves an existing Storage on its own binding', () => {
    credentialsState.credentials = [credential({ id: 'only' })];
    const onChange = renderField({
      isNew: false,
      summary: { access: 'restricted', state: 'ready' },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps a Storage still on its own key on that key, empty and with nothing picked', () => {
    const pending: CredentialSummary = { access: 'pending', state: 'ready' };
    credentialsState.credentials = [credential({ id: 'only' })];
    const onChange = renderField({ summary: pending });

    expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent(
      'Select a Credential'
    );
    expect(onChange).not.toHaveBeenCalled();
    // The own key is the binding the field keeps; the mark shows nothing for a ready summary.
    expect(stateMark.summaries).toContainEqual(pending);
  });

  it('does not pick a Credential that appears after the list loaded', () => {
    const onChange = vi.fn();
    const field = () => (
      <ConsumerCredentialField
        consumer='storage'
        consumerType='GOOGLE_BIGQUERY'
        isNew
        value={null}
        summary={null}
        onChange={onChange}
      />
    );
    const { rerender } = render(field());

    credentialsState.credentials = [credential({ id: 'created-after-cancel' })];
    rerender(field());

    expect(onChange).not.toHaveBeenCalled();
  });

  it('waits for the list before selecting', () => {
    credentialsState.isLoading = true;
    const onChange = vi.fn();
    const field = () => (
      <ConsumerCredentialField
        consumer='storage'
        consumerType='GOOGLE_BIGQUERY'
        isNew
        value={null}
        summary={null}
        onChange={onChange}
      />
    );
    const { rerender } = render(field());

    credentialsState.isLoading = false;
    credentialsState.credentials = [credential({ id: 'only' })];
    rerender(field());

    expect(onChange).toHaveBeenCalledWith('only', 'auto');
  });

  it('does not choose for the user when several Credentials fit', () => {
    credentialsState.credentials = [credential({ id: 'a' }), credential({ id: 'b' })];
    const onChange = renderField({ isNew: true });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('says there are no Credentials yet and offers to create one', async () => {
    renderField({ isNew: true });

    expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent(
      'No Credentials yet'
    );
    expect((await openOptions()).map(option => option.textContent)).toEqual([
      '+ Create new Credential',
    ]);
  });

  it('says the list failed instead of offering a first Credential, and picks one once it loads', () => {
    credentialsState.isError = true;
    const onChange = vi.fn();
    const field = () => (
      <ConsumerCredentialField
        consumer='storage'
        consumerType='GOOGLE_BIGQUERY'
        isNew
        value={null}
        summary={null}
        onChange={onChange}
      />
    );
    const { rerender } = render(field());

    expect(screen.queryByText('No Credentials yet')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Credential' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load Credentials.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(credentialsState.refetch).toHaveBeenCalled();

    credentialsState.isError = false;
    credentialsState.credentials = [credential({ id: 'only' })];
    rerender(field());

    expect(onChange).toHaveBeenCalledWith('only', 'auto');
  });

  it('takes the id and invalid state the form gives it', () => {
    render(
      <ConsumerCredentialField
        consumer='storage'
        consumerType='GOOGLE_BIGQUERY'
        isNew
        value={null}
        summary={null}
        onChange={vi.fn()}
        id='credential-field'
        aria-invalid
        aria-describedby='credential-message'
      />
    );

    const trigger = screen.getByRole('combobox', { name: 'Credential' });
    expect(trigger).toHaveAttribute('id', 'credential-field');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-describedby', 'credential-message');
  });

  it('shows a Credential the member cannot see as restricted and lets them switch', async () => {
    credentialsState.credentials = [credential({ id: 'mine', title: 'My key' })];
    const onChange = renderField({ summary: { access: 'restricted', state: 'ready' } });

    expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent(
      'Restricted Credential'
    );
    fireEvent.click((await openOptions())[0]);

    expect(onChange).toHaveBeenCalledWith('mine', 'existing');
  });

  it('shows the bound Credential even when it is no longer offered', () => {
    renderField({ value: 'cred-1', summary: { ...visibleSummary, state: 'disabled' } });

    expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveTextContent('Analytics key');
  });

  it('creates a Credential in a second Sheet and selects it', async () => {
    const onChange = renderField();

    fireEvent.click((await openOptions()).at(-1)!);

    expect(sheet.props).toMatchObject({
      isOpen: true,
      credential: null,
      allowedDefinitionIds: ['google-service-account', 'google-oauth'],
      defaultSharing: 'not-shared',
    });
    act(() => {
      sheet.props?.onCreated?.(credential({ id: 'new', definitionId: 'google-oauth' }));
    });

    expect(onChange).toHaveBeenCalledWith('new', 'created');
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'storage_credential_created',
      category: 'DataStorage',
      action: 'google-oauth',
      label: 'GOOGLE_BIGQUERY',
      context: null,
      value: null,
    });
  });

  it('presets the provider when only one fits', async () => {
    renderField({ consumerType: 'DATABRICKS' });

    fireEvent.click((await openOptions()).at(-1)!);

    expect(sheet.props).toMatchObject({
      allowedDefinitionIds: ['databricks-token'],
      initialDefinitionId: 'databricks-token',
    });
  });

  it('does not select a Credential whose Sheet the user closed before it was created', async () => {
    const onChange = renderField();
    fireEvent.click((await openOptions()).at(-1)!);
    const { onClose, onCreated } = sheet.props!;

    act(() => {
      onClose();
    });
    act(() => {
      onCreated?.(credential({ id: 'late' }));
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a late create and close from a Sheet that is no longer the open one', async () => {
    const onChange = renderField();
    fireEvent.click((await openOptions()).at(-1)!);
    const first = sheet.props!;
    act(() => {
      first.onClose();
    });
    await screen.findByRole('combobox', { name: 'Credential' });
    fireEvent.click((await openOptions()).at(-1)!);

    act(() => {
      first.onCreated?.(credential({ id: 'late' }));
      first.onClose();
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save Credential' })).toBeInTheDocument();
  });

  // The Sheet takes focus when it opens; the list closing alone would hand it back to the field.
  describe('focus after the create Sheet', () => {
    async function openSheetWithFocusInside() {
      renderField({ id: 'storageCredential' });
      fireEvent.click((await openOptions()).at(-1)!);
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).toBeNull();
      });
      const inside = screen.getByRole('button', { name: 'Save Credential' });
      inside.focus();
      expect(inside).toHaveFocus();
    }

    it('returns to the Credential field when the Sheet is closed', async () => {
      await openSheetWithFocusInside();

      act(() => {
        sheet.props?.onClose();
      });

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveFocus();
      });
    });

    it('returns to the Credential field when a Credential is created', async () => {
      await openSheetWithFocusInside();

      act(() => {
        sheet.props?.onCreated?.(credential({ id: 'new' }));
      });

      await waitFor(() => {
        expect(screen.getByRole('combobox', { name: 'Credential' })).toHaveFocus();
      });
    });
  });

  it('searches by title, identity and provider, not by the Credential id', async () => {
    credentialsState.credentials = [credential({ id: 'zz9f1' })];
    renderField();
    await openOptions();
    const search = screen.getByPlaceholderText('Search...');

    fireEvent.change(search, { target: { value: '9f1' } });
    await waitFor(() => {
      expect(within(document.body).queryByText('Analytics key')).toBeNull();
    });

    fireEvent.change(search, { target: { value: 'analytics' } });
    expect(await within(document.body).findByText('Analytics key')).toBeInTheDocument();
  });

  it('keeps the create item when a search matches nothing', async () => {
    credentialsState.credentials = [credential()];
    renderField();
    await openOptions();

    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'prod-bq' } });

    expect(await within(document.body).findByText('No Credentials found')).toBeInTheDocument();
    expect(
      within(document.body).getByRole('option', { name: '+ Create new Credential' })
    ).toBeInTheDocument();
  });

  it('keeps the create Sheet from submitting the Storage form around it', async () => {
    const onStorageSubmit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onStorageSubmit}>
        <ConsumerCredentialField
          consumer='storage'
          consumerType='SNOWFLAKE'
          isNew={false}
          value={null}
          summary={null}
          onChange={vi.fn()}
        />
      </form>
    );

    fireEvent.click((await openOptions()).at(-1)!);
    fireEvent.click(await screen.findByRole('button', { name: 'Save Credential' }));

    expect(onStorageSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled', 'Credential disabled'],
    ['reconnect-required', 'Reconnect the Credential'],
    ['reauthorize-required', 'Reconnect the Credential to grant permissions'],
  ] as const)('marks a bound Credential in state %s', (state, text) => {
    renderField({ value: 'cred-1', summary: { ...visibleSummary, state } });

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('marks a restricted Credential that needs attention', () => {
    renderField({ summary: { access: 'restricted', state: 'disabled' } });

    expect(screen.getByText("Ask the Credential's owner to enable it")).toBeInTheDocument();
  });

  it('drops the mark once another Credential is selected', () => {
    renderField({ value: 'other', summary: { ...visibleSummary, state: 'disabled' } });

    expect(screen.queryByText('Credential disabled')).toBeNull();
  });
});

describe('ConsumerCredentialField for a Destination', () => {
  beforeEach(() => {
    credentialsState.credentials = [];
    credentialsState.isLoading = false;
    credentialsState.isError = false;
    definitionsState.definitions = [
      {
        id: 'google-service-account',
        storageTypes: ['GOOGLE_BIGQUERY'],
        destinationTypes: ['GOOGLE_SHEETS'],
      },
      { id: 'google-sheets-oauth', destinationTypes: ['GOOGLE_SHEETS'] },
      { id: 'google-chat-webhook', destinationTypes: ['GOOGLE_CHAT'] },
      { id: 'google-oauth', storageTypes: ['GOOGLE_BIGQUERY'] },
    ];
    definitionsState.isLoading = false;
    definitionsState.isError = false;
    sheet.props = null;
    trackEvent.mockReset();
  });

  function renderDestinationField(destinationType: string, onCreated = vi.fn()) {
    const onChange = vi.fn();
    render(
      <ConsumerCredentialField
        consumer='destination'
        consumerType={destinationType}
        isNew
        value={null}
        summary={null}
        onChange={onChange}
        onCreated={onCreated}
      />
    );
    return { onChange, onCreated };
  }

  it('offers only the Credentials that fit the Destination type', async () => {
    credentialsState.credentials = [
      credential({ id: 'sa', title: 'sa' }),
      credential({ id: 'webhook', title: 'webhook', definitionId: 'google-chat-webhook' }),
      credential({ id: 'bq-oauth', title: 'bq-oauth', definitionId: 'google-oauth' }),
    ];
    renderDestinationField('GOOGLE_CHAT');

    expect((await openOptions()).map(option => option.textContent)).toEqual([
      expect.stringContaining('webhook'),
      '+ Create new Credential',
    ]);
  });

  it('creates a fitting Credential, reports it for the Destination type and hands it over', async () => {
    const { onChange, onCreated } = renderDestinationField('GOOGLE_SHEETS');

    fireEvent.click((await openOptions()).at(-1)!);

    expect(sheet.props?.allowedDefinitionIds).toEqual([
      'google-service-account',
      'google-sheets-oauth',
    ]);
    const created = credential({ id: 'new', definitionId: 'google-sheets-oauth' });
    act(() => {
      sheet.props?.onCreated?.(created);
    });

    expect(onChange).toHaveBeenCalledWith('new', 'created');
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'destination_credential_created',
      category: 'DataDestination',
      action: 'google-sheets-oauth',
      label: 'GOOGLE_SHEETS',
      context: null,
      value: null,
    });
  });
});
