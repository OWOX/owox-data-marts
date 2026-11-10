import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginGalleryEntry } from '../types';
import { InstallPluginDialog } from './InstallPluginDialog';

const credentialState = vi.hoisted(() => ({
  credentials: [] as Record<string, unknown>[],
  definitions: [] as Record<string, unknown>[],
  credentialsLoading: false,
  credentialsFailed: false,
  owoxAi: undefined as { models: string[]; billed: boolean } | undefined,
  owoxAiLoading: false,
}));

vi.mock('../hooks/useOwoxAi', () => ({
  useOwoxAi: () => ({ owoxAi: credentialState.owoxAi, isLoading: credentialState.owoxAiLoading }),
}));

vi.mock('../../../shared/components/Combobox/combobox', () => ({
  Combobox: ({
    options,
    value,
    disabled,
    onValueChange,
    onOpenChange,
    ariaLabel,
    ariaDescribedBy,
    placeholder,
  }: {
    options: { value: string; label: string }[];
    value: string;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    onOpenChange?: (open: boolean) => void;
    ariaLabel?: string;
    ariaDescribedBy?: string;
    placeholder?: string;
  }) => (
    <select
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
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
    isError: credentialState.credentialsFailed,
  }),
  useCredentialDefinitions: () => ({ definitions: credentialState.definitions }),
  normalizePluginCredentialRequirement: (
    requirement:
      | string
      | {
          id: string;
          definitionId?: string;
          optional: boolean;
          models?: readonly string[];
          scopes?: readonly string[];
        }
  ) =>
    typeof requirement === 'string'
      ? {
          key: requirement,
          definitionId: requirement === 'ai' ? null : requirement,
          optional: false,
          models: requirement === 'ai' ? ['fast'] : [],
          scopes: [],
        }
      : {
          key: requirement.id,
          definitionId:
            requirement.definitionId ?? (requirement.id === 'ai' ? null : requirement.id),
          optional: requirement.optional,
          models: requirement.models ?? (requirement.id === 'ai' ? ['fast'] : []),
          scopes: [...(requirement.scopes ?? [])],
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
    credentialState.credentialsFailed = false;
    credentialState.owoxAi = undefined;
    credentialState.owoxAiLoading = false;
  });

  /**
   * The three statements a member must see before granting their authority to third-party
   * code. Wording is product copy, but the facts are the authoring-guide contract.
   */
  it('states access, data exfiltration, and that installing again restores nothing on the plugin side', () => {
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
      "Uninstalling and installing again restores nothing the plugin kept on its publisher's side."
    );
  });

  it('says where a plugin with a backend runs its code', () => {
    render(
      <InstallPluginDialog
        plugin={plugin({ backendOrigin: 'https://acme.workers.dev' })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByTestId('install-data-notice')).toHaveTextContent(
      'Runs code on https://acme.workers.dev with your access, including when the plugin is closed.'
    );
  });

  it('says nothing about a backend the plugin does not have', () => {
    render(
      <InstallPluginDialog
        plugin={plugin()}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByTestId('install-data-notice')).not.toHaveTextContent('Runs code on');
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

  describe('a plugin that is not listed for the member', () => {
    const renderDialog = (over: Partial<PluginGalleryEntry>) =>
      render(
        <InstallPluginDialog
          plugin={plugin(over)}
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          isInstalling={false}
        />
      );

    it('adds no warning for a listed plugin', () => {
      renderDialog({ visibleViaScopes: ['member'] });

      expect(screen.getByTestId('install-data-notice')).not.toHaveTextContent(
        "isn't listed for you"
      );
    });

    it('names the repository to trust for a public plugin', () => {
      renderDialog({ visibleViaScopes: [] });

      expect(screen.getByTestId('install-data-notice')).toHaveTextContent(
        "This plugin isn't listed for you. Install it only if you trust acme/example-plugin."
      );
    });

    it('points at the sender when the repository is withheld', () => {
      renderDialog({
        visibleViaScopes: [],
        source: { ownerName: 'acme', ownerUrl: 'https://github.com/acme' },
      });

      expect(screen.getByTestId('install-data-notice')).toHaveTextContent(
        "This plugin isn't listed for you. Install it only if you trust whoever sent you the link."
      );
    });
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

  it('lists the scopes a Google Service Account requirement declares', () => {
    credentialState.definitions = [
      definition({ id: 'google-service-account', displayName: 'BigQuery Service Account' }),
    ];

    render(
      <InstallPluginDialog
        plugin={plugin({
          credentialRequirements: [
            {
              id: 'google-service-account',
              optional: false,
              scopes: [
                'https://www.googleapis.com/auth/documents',
                'https://www.googleapis.com/auth/spreadsheets',
              ],
            },
          ],
        })}
        open
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isInstalling={false}
      />
    );

    expect(screen.getByText('Scopes:')).toBeInTheDocument();
    expect(screen.getByText('https://www.googleapis.com/auth/documents')).toBeInTheDocument();
    expect(screen.getByText('https://www.googleapis.com/auth/spreadsheets')).toBeInTheDocument();
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

  describe('when the Credentials list is loading or failed', () => {
    const renderDialog = (over: Partial<PluginGalleryEntry> = {}) =>
      render(
        <InstallPluginDialog
          plugin={plugin(over)}
          open
          onOpenChange={vi.fn()}
          onConfirm={vi.fn()}
          isInstalling={false}
        />
      );

    it.each([
      ['failed', { credentialsFailed: true }],
      ['loading', { credentialsLoading: true }],
    ])('installs a plugin that declares no Credentials while the list is %s', (_, state) => {
      Object.assign(credentialState, state);

      renderDialog();

      expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
    });

    it('does not install a plugin that needs Credentials when the list failed', () => {
      credentialState.credentialsFailed = true;
      credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];

      renderDialog({ credentialRequirements: [{ id: 'github', optional: true }] });

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Could not load the project's Credentials"
      );
      expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    });
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
      scopes: [],
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

  describe('OWOX AI', () => {
    const OWOX_AI_NOTE = 'OWOX provides the AI models. You do not need a key from an AI provider.';
    const OWOX_AI_BILLED_NOTE = `${OWOX_AI_NOTE} Calls use this project's credits.`;
    const aiPlugin = (over: Partial<PluginGalleryEntry> = {}) =>
      plugin({ credentialRequirements: [{ id: 'ai', optional: false }], ...over });
    const optionalAiPlugin = () =>
      plugin({ credentialRequirements: [{ id: 'ai', optional: true }] });
    const dialog = (p: PluginGalleryEntry, onConfirm = vi.fn()) => (
      <InstallPluginDialog
        plugin={p}
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        isInstalling={false}
      />
    );
    const renderDialog = (p: PluginGalleryEntry, onConfirm = vi.fn()) =>
      render(dialog(p, onConfirm));
    const aiSelect = () => screen.getByRole('combobox', { name: 'Select AI Credential' });
    const aiCredential = () => ({
      ...credential(),
      definition: definition({ supportsAi: true }),
      aiModelMappings: { fast: 'm' },
    });

    it('lists OWOX AI first for an ai requirement and preselects it on install', () => {
      const onConfirm = vi.fn();
      credentialState.owoxAi = { models: ['fast', 'reasoning'], billed: false };
      renderDialog(aiPlugin(), onConfirm);

      const options = within(aiSelect()).getAllByRole('option');
      expect(options[1]).toHaveTextContent('OWOX AI');
      expect(aiSelect()).toHaveValue('owox-ai');
      const install = screen.getByRole('button', { name: 'Install' });
      expect(install).toBeEnabled();
      fireEvent.click(install);
      expect(onConfirm).toHaveBeenCalledWith({ ai: 'owox-ai' });
    });

    it('names OWOX AI first among the allowed providers when it is offered', () => {
      credentialState.owoxAi = { models: ['fast'], billed: false };
      credentialState.definitions = [
        definition({ id: 'openai', displayName: 'OpenAI', supportsAi: true }),
      ];
      renderDialog(aiPlugin());

      expect(screen.getByText('Allowed providers: OWOX AI, OpenAI')).toBeInTheDocument();
    });

    it('does not offer OWOX AI when it lacks a declared model', () => {
      credentialState.owoxAi = { models: ['fast', 'reasoning'], billed: false };
      credentialState.definitions = [
        definition({ id: 'openai', displayName: 'OpenAI', supportsAi: true }),
      ];
      renderDialog(
        aiPlugin({ credentialRequirements: [{ id: 'ai', optional: false, models: ['embedding'] }] })
      );

      expect(screen.queryByRole('option', { name: 'OWOX AI' })).not.toBeInTheDocument();
      expect(screen.getByText('Allowed providers: OpenAI')).toBeInTheDocument();
    });

    it('does not offer OWOX AI for an exact requirement', () => {
      credentialState.owoxAi = { models: ['fast', 'reasoning'], billed: false };
      credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];
      renderDialog(plugin({ credentialRequirements: ['github'] }));

      expect(screen.queryByRole('option', { name: 'OWOX AI' })).not.toBeInTheDocument();
    });

    it('explains OWOX AI, with the credits, only when OWOX AI is selected and billed', () => {
      credentialState.owoxAi = { models: ['fast'], billed: true };
      credentialState.credentials = [aiCredential()];
      renderDialog(aiPlugin());

      expect(screen.getByText(OWOX_AI_BILLED_NOTE)).toBeInTheDocument();
      fireEvent.change(aiSelect(), { target: { value: 'credential-1' } });
      expect(screen.queryByText(OWOX_AI_BILLED_NOTE)).not.toBeInTheDocument();
    });

    it('links the OWOX AI note to its selector', () => {
      credentialState.owoxAi = { models: ['fast'], billed: true };
      renderDialog(aiPlugin());

      const note = screen.getByText(OWOX_AI_BILLED_NOTE);
      expect(note.id).not.toBe('');
      expect(aiSelect()).toHaveAttribute('aria-describedby', note.id);
    });

    it('explains OWOX AI without the credits when OWOX AI is not billed', () => {
      credentialState.owoxAi = { models: ['fast'], billed: false };
      renderDialog(aiPlugin());

      const note = screen.getByText(OWOX_AI_NOTE);
      expect(aiSelect()).toHaveAttribute('aria-describedby', note.id);
    });

    it('keeps a Credential the member picked before the OWOX AI status arrived', () => {
      credentialState.credentials = [aiCredential()];
      credentialState.owoxAiLoading = true;
      const view = renderDialog(aiPlugin());
      fireEvent.change(aiSelect(), { target: { value: 'credential-1' } });

      credentialState.owoxAi = { models: ['fast'], billed: false };
      credentialState.owoxAiLoading = false;
      view.rerender(dialog(aiPlugin()));

      expect(screen.getByRole('option', { name: 'OWOX AI' })).toBeInTheDocument();
      expect(aiSelect()).toHaveValue('credential-1');
    });

    it('drops a stale OWOX AI choice for a required requirement when the status loses its models', () => {
      credentialState.owoxAi = { models: ['fast'], billed: false };
      const view = renderDialog(aiPlugin());
      expect(aiSelect()).toHaveValue('owox-ai');

      credentialState.owoxAi = { models: [], billed: false };
      view.rerender(dialog(aiPlugin()));

      expect(aiSelect()).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    });

    it('drops a stale OWOX AI choice the member made', () => {
      credentialState.owoxAi = { models: ['fast'], billed: false };
      credentialState.credentials = [aiCredential()];
      const view = renderDialog(aiPlugin());
      fireEvent.change(aiSelect(), { target: { value: 'credential-1' } });
      fireEvent.change(aiSelect(), { target: { value: 'owox-ai' } });

      credentialState.owoxAi = { models: [], billed: false };
      view.rerender(dialog(aiPlugin()));

      expect(aiSelect()).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    });

    it('lets a member choose Do not grant after OWOX AI is gone for an optional requirement', () => {
      credentialState.owoxAi = { models: ['fast'], billed: false };
      const onConfirm = vi.fn();
      const view = renderDialog(optionalAiPlugin(), onConfirm);

      credentialState.owoxAi = { models: [], billed: false };
      view.rerender(dialog(optionalAiPlugin(), onConfirm));

      expect(aiSelect()).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
      fireEvent.change(aiSelect(), { target: { value: '__none__' } });
      fireEvent.click(screen.getByRole('button', { name: 'Install' }));
      expect(onConfirm).toHaveBeenCalledWith({ ai: null });
    });

    it('disables confirm while the OWOX AI status loads', () => {
      const view = renderDialog(optionalAiPlugin());
      fireEvent.change(aiSelect(), { target: { value: '__none__' } });
      expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();

      credentialState.owoxAiLoading = true;
      view.rerender(dialog(optionalAiPlugin()));

      expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
    });

    it('does not wait for the OWOX AI status for a plugin with no ai requirement', () => {
      credentialState.owoxAiLoading = true;
      credentialState.definitions = [definition({ id: 'github', displayName: 'GitHub' })];
      credentialState.credentials = [credential()];
      renderDialog(plugin({ credentialRequirements: ['github'] }));

      fireEvent.change(screen.getByRole('combobox', { name: 'Select GitHub Credential' }), {
        target: { value: 'credential-1' },
      });
      expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled();
    });

    it('keeps Do not grant and Add Credential for an optional ai requirement', () => {
      credentialState.owoxAi = { models: ['fast'], billed: false };
      credentialState.definitions = [
        { ...definition({ id: 'openai', supportsAi: true }), ai: { recommended: { fast: 'm' } } },
      ];
      renderDialog(optionalAiPlugin());

      expect(screen.getByRole('option', { name: 'OWOX AI' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Do not grant' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Add Credential' })).toBeInTheDocument();
    });

    it('offers nothing new when OWOX AI is off', () => {
      credentialState.owoxAi = { models: [], billed: false };
      renderDialog(aiPlugin());

      expect(screen.queryByRole('option', { name: 'OWOX AI' })).not.toBeInTheDocument();
      expect(aiSelect()).toHaveValue('');
    });
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
