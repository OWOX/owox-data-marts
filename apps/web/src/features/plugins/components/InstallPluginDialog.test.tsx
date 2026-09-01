import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginGalleryEntry } from '../types';
import { InstallPluginDialog } from './InstallPluginDialog';

const credentialState = vi.hoisted(() => ({
  credentials: [] as Record<string, unknown>[],
  definitions: [] as Record<string, unknown>[],
  credentialsLoading: false,
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

vi.mock('../../credentials', () => ({
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
  }),
  useCredentialDefinitions: () => ({ definitions: credentialState.definitions }),
  normalizePluginCredentialRequirement: (
    requirement:
      | string
      | { id: string; definitionId?: string; optional: boolean; models?: readonly string[] }
  ) =>
    typeof requirement === 'string'
      ? {
          key: requirement,
          definitionId: requirement === 'ai' ? null : requirement,
          optional: false,
          models: requirement === 'ai' ? ['fast'] : [],
        }
      : {
          key: requirement.id,
          definitionId:
            requirement.definitionId ?? (requirement.id === 'ai' ? null : requirement.id),
          optional: requirement.optional,
          models: requirement.models ?? (requirement.id === 'ai' ? ['fast'] : []),
        },
  isCredentialEligible: (
    credential: {
      enabled: boolean;
      definitionConsentRequired: boolean;
      definition: { id: string; supportsAi: boolean };
      aiModelMappings?: Record<string, string> | null;
    },
    requirement: { definitionId: string | null; models: string[] }
  ) => {
    if (!credential.enabled || credential.definitionConsentRequired) return false;
    if (requirement.definitionId !== null) {
      return credential.definition.id === requirement.definitionId;
    }
    return (
      credential.definition.supportsAi &&
      requirement.models.every(model => Boolean(credential.aiModelMappings?.[model]))
    );
  },
}));

const plugin = (over: Partial<PluginGalleryEntry> = {}): PluginGalleryEntry => ({
  pluginId: 'p1',
  displayName: 'Example Plugin',
  description: 'Does a thing',
  currentSemver: '1.2.3',
  currentVersionId: 'v1',
  suspended: false,
  installationState: 'not_installed',
  visibleViaScopes: ['member'],
  source: {
    ownerName: 'acme',
    ownerUrl: 'https://github.com/acme',
    repositoryUrl: 'https://github.com/acme/example-plugin',
  },
  ...over,
});

describe('InstallPluginDialog', () => {
  beforeEach(() => {
    credentialState.credentials = [];
    credentialState.definitions = [];
    credentialState.credentialsLoading = false;
  });

  /**
   * The three statements a member must see before granting their authority to third-party
   * code. Wording is product copy, but the facts are the authoring-guide contract.
   */
  it('states access, data exfiltration, and that reinstall restores nothing on the plugin side', () => {
    render(
      <InstallPluginDialog
        plugin={plugin()}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    const notice = screen.getByTestId('install-data-notice');

    expect(notice).toHaveTextContent('Acts with your access to OWOX Data Marts.');
    expect(notice).toHaveTextContent(
      'Anything it reads can leave OWOX and reach the plugin publisher.'
    );
    expect(notice).toHaveTextContent(
      'Reinstalling restores nothing the plugin kept on its own side.'
    );
  });

  it('uses configuration copy when only installed Credential bindings are changing', () => {
    credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];

    render(
      <InstallPluginDialog
        plugin={plugin({ credentialRequirements: ['github'] })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
        mode='configure'
      />
    );

    expect(screen.getByText('Configure plugin Credentials?')).toBeInTheDocument();
    expect(
      screen.getByText('Choose which project Credentials this installed plugin may use.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      screen.getByText('Changing Credential access does not reinstall or clear plugin data.')
    ).toBeInTheDocument();
  });

  it('shows display metadata and the current SemVer required by §13', () => {
    render(
      <InstallPluginDialog
        plugin={plugin()}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText('Example Plugin')).toBeInTheDocument();
    expect(screen.getByTestId('install-version')).toHaveTextContent('v1.2.3');
  });

  /**
   * Publisher-controlled name is React text, never markup. A raw HTML sink here would run
   * third-party code at the moment a member is about to grant their authority.
   */
  it('renders a hostile display name as text, not as DOM', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <InstallPluginDialog
        plugin={plugin({ displayName: hostile })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText(hostile)).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('does not turn a non-https source url into an anchor href', () => {
    render(
      <InstallPluginDialog
        plugin={plugin({
          source: {
            ownerName: 'acme',
            ownerUrl: 'javascript:alert(1)',
            repositoryUrl: 'javascript:alert(2)',
          },
        })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('uses the Credential definition display name and describes an optional provider requirement', () => {
    credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];

    render(
      <InstallPluginDialog
        plugin={plugin({
          credentialRequirements: [{ id: 'github_api', definitionId: 'github', optional: true }],
        })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('(optional)')).toBeInTheDocument();
    expect(screen.getByText('Provider: GitHub')).toBeInTheDocument();
    expect(screen.queryByText('github_api')).not.toBeInTheDocument();
  });

  it('shows AI as a human label and lists the allowed AI providers', () => {
    credentialState.definitions = [
      definition({ id: 'openai', displayName: 'OpenAI', supportsAi: true }),
      definition({ id: 'anthropic', displayName: 'Anthropic', supportsAi: true }),
      definition({ id: 'github', displayName: 'GitHub' }),
    ];

    render(
      <InstallPluginDialog
        plugin={plugin({ credentialRequirements: [{ id: 'ai', optional: false }] })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Allowed providers: OpenAI, Anthropic')).toBeInTheDocument();
  });

  it('humanizes an unknown requirement and provider instead of exposing an identifier-only label', () => {
    render(
      <InstallPluginDialog
        plugin={plugin({
          credentialRequirements: [
            {
              id: 'deployment_api_key',
              definitionId: 'custom-provider',
              optional: false,
            },
          ],
        })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText('Deployment api key')).toBeInTheDocument();
    expect(screen.getByText('Provider: Custom provider')).toBeInTheDocument();
    expect(screen.queryByText('deployment_api_key')).not.toBeInTheDocument();
  });

  it('offers Add Credential inside the selector when no matching Credential exists', () => {
    credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];

    render(
      <InstallPluginDialog
        plugin={plugin({ credentialRequirements: ['github'] })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    const selection = screen.getByRole('combobox', { name: 'Select GitHub Credential' });
    expect(selection).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Add Credential' })).toBeInTheDocument();
    expect(
      screen.queryByText('No enabled matching Credential is available.')
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('shows a destructive selection error only after the required field was touched', () => {
    credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];
    credentialState.credentials = [credential()];
    const onConfirm = vi.fn();

    render(
      <InstallPluginDialog
        plugin={plugin({ credentialRequirements: ['github'] })}
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        isInstalling={false}
      />
    );

    const selection = screen.getByRole('combobox', { name: 'Select GitHub Credential' });
    const install = screen.getByRole('button', { name: 'Install' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(install).toBeDisabled();

    fireEvent.focus(selection);
    fireEvent.blur(selection);
    expect(screen.getByRole('alert')).toHaveTextContent('Select a Credential to continue.');

    fireEvent.change(selection, { target: { value: 'credential-1' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(install).toBeEnabled();

    fireEvent.click(install);
    expect(onConfirm).toHaveBeenCalledWith({ github: 'credential-1' });
  });

  it('accepts an explicit Do not grant decision for an optional requirement', () => {
    credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];

    render(
      <InstallPluginDialog
        plugin={plugin({
          credentialRequirements: [{ id: 'github', optional: true }],
        })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    const selection = screen.getByRole('combobox', { name: 'Select GitHub Credential' });
    const install = screen.getByRole('button', { name: 'Install' });
    expect(install).toBeDisabled();

    fireEvent.change(selection, { target: { value: '__none__' } });
    expect(install).toBeEnabled();
  });

  it('offers the future inline creation callback from the neutral setup state', () => {
    const onAddCredential = vi.fn();
    credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];

    render(
      <InstallPluginDialog
        plugin={plugin({ credentialRequirements: ['github'] })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        onAddCredential={onAddCredential}
        isInstalling={false}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Select GitHub Credential' }), {
      target: { value: '__add_credential__' },
    });
    expect(onAddCredential).toHaveBeenCalledWith({
      key: 'github',
      definitionId: 'github',
      optional: false,
      models: [],
    });
  });

  it('creates and selects a matching Credential without leaving the install flow', () => {
    const onConfirm = vi.fn();
    credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];

    render(
      <InstallPluginDialog
        plugin={plugin({ credentialRequirements: ['github'] })}
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        isInstalling={false}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Select GitHub Credential' }), {
      target: { value: '__add_credential__' },
    });
    fireEvent.click(screen.getByText('Save inline Credential'));

    const install = screen.getByRole('button', { name: 'Install' });
    expect(install).toBeEnabled();
    fireEvent.click(install);
    expect(onConfirm).toHaveBeenCalledWith({ github: 'credential-1' });
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

function credential() {
  return {
    id: 'credential-1',
    title: 'Deployment GitHub',
    enabled: true,
    definitionConsentRequired: false,
    definition: definition(),
    aiModelMappings: null,
  };
}
