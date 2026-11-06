import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginGalleryEntry } from '../types';
import { PluginCredentialsCard } from './PluginCredentialsCard';

const credentialState = vi.hoisted(() => ({
  credentials: [] as Record<string, unknown>[],
  definitions: [] as Record<string, unknown>[],
  credentialsLoading: false,
  credentialsFailed: false,
}));

vi.mock('../../../shared/components/Combobox/combobox', () => ({
  Combobox: ({
    options,
    value,
    disabled,
    onValueChange,
    onOpenChange,
    ariaLabel,
    placeholder,
  }: {
    options: { value: string; label: string }[];
    value: string;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    onOpenChange?: (open: boolean) => void;
    ariaLabel?: string;
    placeholder?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onFocus={() => onOpenChange?.(true)}
      onBlur={() => onOpenChange?.(false)}
      onChange={event => {
        onValueChange(event.target.value);
      }}
    >
      <option value='' disabled>
        {placeholder}
      </option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('../../credentials', async () => {
  const credentialTypes =
    await vi.importActual<typeof import('../../credentials/types')>('../../credentials/types');
  return {
    CredentialConfigSheet: ({
      onCreated,
    }: {
      onCreated: (created: ReturnType<typeof credential>) => void;
    }) => (
      <button
        type='button'
        onClick={() => {
          onCreated(credential());
        }}
      >
        Save inline Credential
      </button>
    ),
    useCredentials: () => ({
      credentials: credentialState.credentials,
      isLoading: credentialState.credentialsLoading,
      isError: credentialState.credentialsFailed,
    }),
    useCredentialDefinitions: () => ({ definitions: credentialState.definitions }),
    normalizePluginCredentialRequirement: credentialTypes.normalizePluginCredentialRequirement,
    isCredentialEligible: credentialTypes.isCredentialEligible,
  };
});

const installedPlugin = (over: Partial<PluginGalleryEntry> = {}): PluginGalleryEntry => ({
  pluginId: 'p1',
  displayName: 'Example Plugin',
  description: 'Does a thing',
  currentSemver: '1.2.3',
  currentVersionId: 'v1',
  suspended: false,
  installationState: 'installed',
  visibleViaScopes: ['member'],
  source: { ownerName: 'acme', ownerUrl: 'https://github.com/acme' },
  credentialRequirements: ['github', { id: 'backup', definitionId: 'github', optional: true }],
  ...over,
});

type CardProps = Parameters<typeof PluginCredentialsCard>[0];

// Spread, not destructured defaults: `granted: undefined` is a case of its own here.
const renderCard = (over: Partial<CardProps> = {}) => {
  const props: CardProps = {
    plugin: installedPlugin(),
    granted: { github: 'credential-1' },
    grantsState: 'loaded',
    isSaving: false,
    disabled: false,
    onSave: vi.fn<CardProps['onSave']>(() => Promise.resolve('saved')),
    ...over,
  };
  const view = render(<PluginCredentialsCard {...props} />);
  return { ...view, props };
};

const selects = () => screen.getAllByRole('combobox', { name: 'Select GitHub Credential' });

describe('PluginCredentialsCard', () => {
  beforeEach(() => {
    credentialState.definitions = [definition()];
    credentialState.credentials = [
      credential(),
      credential({ id: 'credential-2', title: 'Backup GitHub' }),
    ];
    credentialState.credentialsLoading = false;
    credentialState.credentialsFailed = false;
  });

  it('starts from the current grants, with nothing to save or discard yet', () => {
    renderCard();

    const [required, optional] = selects();
    expect(required).toHaveValue('credential-1');
    // Nothing granted to an optional requirement reads as the Do not grant it is.
    expect(optional).toHaveValue('__none__');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('saves the declared requirements only, as changed', async () => {
    const { props } = renderCard({ granted: { github: 'credential-1', removed: 'credential-1' } });

    fireEvent.change(selects()[1], { target: { value: 'credential-2' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(props.onSave).toHaveBeenCalledWith({ github: 'credential-1', backup: 'credential-2' });
  });

  // A different label would resize the button mid-click and shift Discard beside it.
  it('keeps the Save label under the spinner while saving, marked busy', () => {
    renderCard({ isSaving: true });

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('aria-busy', 'true');
    expect(save).toBeDisabled();
    expect(within(save).getByText('Save')).toHaveClass('opacity-0');
    expect(screen.queryByText(/Saving/)).not.toBeInTheDocument();
    // An svg child switches the Button to has-[>svg]:px-3, which narrows it while saving.
    expect(save.querySelector(':scope > svg')).toBeNull();
  });

  it('puts the current grants back on Discard', () => {
    renderCard();

    fireEvent.change(selects()[0], { target: { value: 'credential-2' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(selects()[0]).toHaveValue('credential-1');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  // The page mounts the card while the grants load; only their arrival fills the pickers in.
  it('fills the pickers in when the grants arrive after loading', () => {
    const { rerender, props } = renderCard({ granted: undefined, grantsState: 'loading' });

    rerender(
      <PluginCredentialsCard {...props} granted={{ github: 'credential-1' }} grantsState='loaded' />
    );

    const [required, optional] = selects();
    expect(required).toHaveValue('credential-1');
    expect(optional).toHaveValue('__none__');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('starts over from the saved grants once they arrive, dropping unsaved edits', () => {
    const { rerender, props } = renderCard();
    fireEvent.change(selects()[1], { target: { value: 'credential-2' } });

    rerender(<PluginCredentialsCard {...props} granted={{ github: 'credential-2' }} />);

    expect(selects()[0]).toHaveValue('credential-2');
    // The edit made before they arrived is gone: the saved grants say nothing for backup.
    expect(selects()[1]).toHaveValue('__none__');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  // Refused when saving and at runtime, so it is no decision to keep.
  it('asks again for a granted Credential the member may no longer use', () => {
    credentialState.credentials = [
      credential({ canUse: false }),
      credential({ id: 'credential-2', title: 'Backup GitHub' }),
    ];
    renderCard();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The Credential granted before can no longer be used. Choose another.'
    );
  });

  // An empty list that failed to load is no verdict on any grant.
  it('blames the failed Credentials list, not the grants, and refuses to save', () => {
    credentialState.credentials = [];
    credentialState.credentialsFailed = true;
    renderCard({ granted: { github: 'credential-1', backup: 'credential-1' } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Could not load the project's Credentials. Reload the page to choose them."
    );
    expect(screen.queryByText(/can no longer be used/)).toBeNull();

    fireEvent.change(selects()[1], { target: { value: '__none__' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('asks again for a granted Credential that is no longer usable', () => {
    credentialState.credentials = [
      credential({ enabled: false }),
      credential({ id: 'credential-2', title: 'Backup GitHub' }),
    ];
    renderCard();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The Credential granted before can no longer be used. Choose another.'
    );

    fireEvent.change(selects()[0], { target: { value: 'credential-2' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('says what a grant lets the plugin do, and that the secret stays hidden', () => {
    renderCard({ plugin: installedPlugin({ backendOrigin: 'https://acme.workers.dev' }) });

    const notice = screen.getByTestId('credentials-access-notice');
    expect(notice).toHaveTextContent(
      'The plugin uses these Credentials through OWOX and never sees their secrets.'
    );
    expect(notice).toHaveTextContent(
      'Its code on https://acme.workers.dev can use them with your access, including when the plugin is closed.'
    );
    expect(notice).toHaveTextContent(
      'Anything it reads with them can leave OWOX and reach the plugin publisher.'
    );
    expect(notice).toHaveTextContent('Changing Credential access does not clear plugin data.');
  });

  it('says nothing about a backend the plugin does not have', () => {
    renderCard();

    expect(screen.getByTestId('credentials-access-notice')).not.toHaveTextContent('Its code on');
  });

  it('shows no fields until the grants arrive', () => {
    renderCard({ granted: undefined, grantsState: 'loading' });

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  // Unread grants must not turn into Do not grant: saving that would revoke a real grant.
  it('decides nothing, not even Do not grant, when the grants could not be read', () => {
    renderCard({ granted: undefined, grantsState: 'failed' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load the Credentials this plugin is granted now.'
    );
    const [required, optional] = selects();
    expect(required).toHaveValue('');
    expect(optional).toHaveValue('');

    fireEvent.change(optional, { target: { value: '__none__' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    fireEvent.change(required, { target: { value: 'credential-1' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('says nothing was saved when a newer version arrived meanwhile', async () => {
    renderCard({ onSave: vi.fn<CardProps['onSave']>(() => Promise.resolve('stale')) });

    fireEvent.change(selects()[0], { target: { value: 'credential-2' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(screen.getByRole('status')).toHaveTextContent(
      'A newer version of this plugin arrived, so nothing was saved.'
    );
    // The member's choices survive for the second save.
    expect(selects()[0]).toHaveValue('credential-2');
  });
});

function definition(
  overrides: Partial<{ id: string; displayName: string; supportsAi: boolean }> = {}
) {
  return {
    id: 'github',
    displayName: 'GitHub',
    supportsAi: false,
    ...overrides,
  };
}

function credential(
  overrides: Partial<{ id: string; title: string; enabled: boolean; canUse: boolean }> = {}
) {
  return {
    id: 'credential-1',
    title: 'Deployment GitHub',
    enabled: true,
    definitionConsentRequired: false,
    definition: definition(),
    aiModelMappings: null,
    ...overrides,
  };
}
