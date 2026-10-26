import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Credential, CredentialDefinition } from '../../types';
import { CredentialForm } from './CredentialForm';

const mocks = vi.hoisted(() => ({
  oauthAvailable: true as boolean | undefined,
  exchange: vi.fn(),
  authorize: vi.fn(),
  popup: vi.fn(),
}));

// The real inputs, plus the onChange of the latest render.
const fieldsInputs = vi.hoisted(() => ({
  onChange: null as null | ((key: string, value: string) => void),
}));

vi.mock('../CredentialFieldsInputs', async importOriginal => {
  const actual = await importOriginal<typeof import('../CredentialFieldsInputs')>();
  return {
    CredentialFieldsInputs: (props: Parameters<typeof actual.CredentialFieldsInputs>[0]) => {
      fieldsInputs.onChange = props.onChange;
      return <actual.CredentialFieldsInputs {...props} />;
    },
  };
});

vi.mock('../../useCredentials', () => ({
  useGoogleOAuthAvailable: () => mocks.oauthAvailable,
  useCredentialActions: () => ({
    authorizeGoogleOAuth: mocks.authorize,
    exchangeGoogleOAuth: mocks.exchange,
  }),
}));

vi.mock('../../../google-oauth/utils/open-google-oauth-popup', () => ({
  openGoogleOAuthPopup: mocks.popup,
  GoogleOAuthPopupClosedError: class extends Error {},
}));

vi.mock('../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (path: string) => path }),
}));

vi.mock('../../../contexts/components/ContextPicker/ContextPicker', () => ({
  ContextPicker: () => null,
}));

vi.mock('../../../../shared/components/OwnersSection/OwnersSection', () => ({
  OwnersSection: () => null,
}));

const openAiDefinition: CredentialDefinition = {
  id: 'openai',
  source: 'builtin',
  displayName: 'OpenAI',
  description: 'OpenAI API key',
  documentationUrl: 'https://platform.openai.com/docs/quickstart',
  secretLabel: 'API key',
  origins: ['https://api.openai.com'],
  supportsAi: true,
  ai: {
    adapter: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: {
      language: [
        { id: 'gpt-fast', name: 'GPT Fast' },
        { id: 'gpt-reasoning', name: 'GPT Reasoning' },
      ],
      embedding: [{ id: 'embedding-small', name: 'Embedding Small' }],
    },
    recommended: {
      fast: 'gpt-fast',
      reasoning: 'gpt-reasoning',
      embedding: 'embedding-small',
    },
  },
  compatibilityLine: null,
};

const githubDefinition: CredentialDefinition = {
  id: 'github',
  source: 'builtin',
  displayName: 'GitHub',
  description: 'GitHub token',
  documentationUrl: 'https://docs.github.com/authentication',
  secretLabel: 'Personal access token',
  origins: ['https://api.github.com'],
  supportsAi: false,
  ai: null,
  compatibilityLine: null,
};

const googleDefinition: CredentialDefinition = {
  id: 'google-service-account',
  source: 'builtin',
  displayName: 'BigQuery Service Account',
  description: 'Google Cloud service account JSON key',
  category: 'google',
  documentationUrl: 'https://docs.cloud.google.com/iam/docs/keys-create-delete',
  secretLabel: 'Service account key (JSON)',
  origins: ['https://*.googleapis.com'],
  supportsAi: false,
  ai: null,
  compatibilityLine: null,
  auth: { type: 'google-service-account' },
};

const githubCredential: Credential = {
  id: 'credential-1',
  projectId: 'project-1',
  title: 'GitHub production',
  definition: githubDefinition,
  secretConfigured: true,
  definitionConsentRequired: false,
  enabled: true,
  availableForUse: true,
  availableForMaintenance: true,
  validationState: 'unknown',
  validationMessage: null,
  validatedAt: null,
  lastUsedAt: null,
  aiModelMappings: null,
  aiModelMappingModes: null,
  ownerUsers: [{ userId: 'owner-1', fullName: 'Owner', email: 'owner@example.com', avatar: null }],
  contexts: [],
  usedBy: [],
  createdAt: '2026-08-31T10:00:00.000Z',
  modifiedAt: '2026-08-31T10:00:00.000Z',
};

function renderForm(overrides: Partial<React.ComponentProps<typeof CredentialForm>> = {}) {
  return render(
    <MemoryRouter>
      <CredentialForm
        credential={null}
        definitions={[openAiDefinition]}
        isSaving={false}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>
  );
}

describe('CredentialForm', () => {
  it('uses standard sections and hides non-editable recommended model IDs', () => {
    renderForm();

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('AI models')).toBeInTheDocument();
    expect(screen.getByText('Sharing')).toBeInTheDocument();
    expect(screen.queryByLabelText('Model ID')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How to get this key' })).toHaveAttribute(
      'href',
      'https://platform.openai.com/docs/quickstart'
    );
  });

  it('shows a model ID field only after Override model ID is selected', async () => {
    renderForm();

    fireEvent.pointerDown(screen.getByTestId('credentialAiMode-fast'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(
      await within(document.body).findByRole('option', { name: 'Override model ID' })
    );

    expect(await screen.findByLabelText('Model ID')).toBeInTheDocument();
  });

  it('loads a GitHub definition inline and selects it', async () => {
    const onRequestAddGithubDefinition = vi.fn().mockResolvedValue(githubDefinition);
    renderForm({ onRequestAddGithubDefinition });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });
    fireEvent.click(
      await within(document.body).findByRole('option', {
        name: 'GitHub definition',
      })
    );

    expect(screen.getByLabelText('GitHub repository')).toBeInTheDocument();
    expect(screen.queryByText('Authentication')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('GitHub repository'), {
      target: { value: ' @owner/repository ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load definition' }));

    await waitFor(() => {
      expect(onRequestAddGithubDefinition).toHaveBeenCalledWith('@owner/repository');
    });
    expect(await screen.findByText('Personal access token')).toBeInTheDocument();
    expect(screen.queryByLabelText('GitHub repository')).not.toBeInTheDocument();
    expect(screen.queryByText('AI models')).not.toBeInTheDocument();
  });

  it('validates the GitHub repository inline before loading the definition', async () => {
    const onRequestAddGithubDefinition = vi.fn().mockResolvedValue(githubDefinition);
    renderForm({ onRequestAddGithubDefinition });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });
    fireEvent.click(
      await within(document.body).findByRole('option', { name: 'GitHub definition' })
    );
    fireEvent.change(screen.getByLabelText('GitHub repository'), {
      target: { value: 'owner/repository' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load definition' }));

    expect(await screen.findByText('Enter a repository as @owner/repository')).toBeInTheDocument();
    expect(onRequestAddGithubDefinition).not.toHaveBeenCalled();
  });

  it('shows a GitHub definition load failure inline', async () => {
    const onRequestAddGithubDefinition = vi.fn().mockRejectedValue({
      response: { data: { message: 'Definition release was not found' } },
    });
    renderForm({ onRequestAddGithubDefinition });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });
    fireEvent.click(
      await within(document.body).findByRole('option', { name: 'GitHub definition' })
    );
    fireEvent.change(screen.getByLabelText('GitHub repository'), {
      target: { value: '@owner/missing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load definition' }));

    expect(await screen.findByText('Definition release was not found')).toBeInTheDocument();
    expect(screen.getByLabelText('GitHub repository')).toBeInTheDocument();
  });

  it('offers the GitHub App installation link for an inaccessible private definition', async () => {
    const onRequestAddGithubDefinition = vi.fn().mockRejectedValue({
      response: {
        data: {
          code: 'GITHUB_REPO_NOT_ACCESSIBLE',
          message: 'OWOX Data Marts cannot read owner/private-definition.',
          errorDetails: {
            installationUrl: 'https://github.com/apps/owox-data-marts/installations/new',
          },
        },
      },
    });
    renderForm({ onRequestAddGithubDefinition });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Provider' }), { button: 0 });
    fireEvent.click(
      await within(document.body).findByRole('option', { name: 'GitHub definition' })
    );
    fireEvent.change(screen.getByLabelText('GitHub repository'), {
      target: { value: '@owner/private-definition' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load definition' }));

    expect(
      await screen.findByRole('link', {
        name: 'Give OWOX Data Marts access to this repository',
      })
    ).toHaveAttribute('href', 'https://github.com/apps/owox-data-marts/installations/new');
  });

  it('submits only dirty fields and hides owner-only controls from a maintenance user', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({
      credential: githubCredential,
      definitions: [githubDefinition],
      canManageAccess: false,
      onSubmit,
    });

    expect(screen.queryByText('Ownership')).not.toBeInTheDocument();
    expect(screen.queryByText('Contexts')).not.toBeInTheDocument();
    expect(screen.queryByText('Sharing')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Renamed Credential' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ title: 'Renamed Credential' });
    });
  });

  it('takes a Google service account key in a JSON textarea', () => {
    renderForm({ definitions: [googleDefinition] });

    const field = screen.getByPlaceholderText(
      'Paste the service account JSON key or drop the file'
    );
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).toHaveAttribute('spellcheck', 'false');
    expect(screen.getByText('Service account key (JSON)')).toBeInTheDocument();
  });

  it('explains how to get a Google service account key and keeps the docs link', () => {
    renderForm({ definitions: [googleDefinition] });

    expect(screen.getByText('How do I get a Service Account JSON key?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How to get this key' })).toHaveAttribute(
      'href',
      'https://docs.cloud.google.com/iam/docs/keys-create-delete'
    );
  });

  it('shows the service account address of a saved key with a copy action', () => {
    renderForm({
      definitions: [googleDefinition],
      credential: {
        ...githubCredential,
        title: 'Docs writer',
        definition: googleDefinition,
        publicMetadata: {
          clientEmail: 'docs-writer@acme-docs.iam.gserviceaccount.com',
          projectId: 'acme-docs',
          privateKeyId: 'key-1',
        },
      },
    });

    expect(screen.getByText('Service account')).toBeInTheDocument();
    expect(screen.getByText('docs-writer@acme-docs.iam.gserviceaccount.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy service account email' })).toBeInTheDocument();
    expect(screen.getByText('Share documents with this address as Editor')).toBeInTheDocument();
  });

  describe('Storage providers', () => {
    const snowflakeDefinition: CredentialDefinition = {
      id: 'snowflake-password',
      source: 'builtin',
      displayName: 'Snowflake password',
      description: 'Snowflake user and password',
      documentationUrl: null,
      secretLabel: '',
      category: 'snowflake',
      origins: [],
      supportsAi: false,
      ai: null,
      compatibilityLine: null,
      auth: {
        type: 'fields',
        fields: [
          {
            key: 'username',
            label: 'Username',
            input: 'text',
            secret: false,
            required: true,
            identity: true,
          },
          {
            key: 'password',
            label: 'Password',
            input: 'password',
            secret: true,
            required: true,
            identity: false,
          },
        ],
      },
    };
    const googleOAuthDefinition: CredentialDefinition = {
      ...snowflakeDefinition,
      id: 'google-oauth',
      displayName: 'BigQuery Google account',
      category: 'google',
      auth: { type: 'oauth', provider: 'google' },
    };
    const snowflakeCredential: Credential = {
      ...githubCredential,
      definition: snowflakeDefinition,
      publicMetadata: { fields: { username: 'ann' } },
      identity: 'ann',
      setSecretFieldKeys: ['password'],
      usedBy: [
        {
          consumerType: 'storage',
          consumerId: 'storage-1',
          title: 'Warehouse',
          requirementKey: 'storage',
          lastUsedAt: null,
        },
      ],
    };

    it('lists only the allowed providers and presets the one that fits', async () => {
      renderForm({
        definitions: [openAiDefinition, githubDefinition, snowflakeDefinition],
        allowedDefinitionIds: ['github', 'snowflake-password'],
        initialDefinitionId: 'snowflake-password',
      });

      const input = screen.getByRole('combobox', { name: 'Provider' });
      expect(input).toHaveValue('Snowflake password');
      fireEvent.mouseDown(input, { button: 0 });
      const options = await within(document.body).findAllByRole('option');
      expect(options.map(option => option.textContent)).toEqual(['Snowflake password', 'GitHub']);
    });

    it('explains the provider choice and the help of each field', () => {
      renderForm({
        definitions: [
          snowflakeDefinition,
          { ...snowflakeDefinition, id: 'snowflake-key-pair', displayName: 'Snowflake key pair' },
        ],
      });

      expect(screen.getByText('Which provider should I choose?')).toBeInTheDocument();
      expect(screen.getByText('How do I find my Snowflake username?')).toBeInTheDocument();
      expect(screen.getByLabelText('Username')).toHaveAttribute('placeholder', 'Enter username');
    });

    it('explains the provider choice when both Google providers are offered', () => {
      renderForm({ definitions: [googleDefinition, googleOAuthDefinition] });

      expect(screen.getByText('Which provider should I choose?')).toBeInTheDocument();
    });

    it('does not explain the provider choice when the sheet allows one Google provider', () => {
      renderForm({
        definitions: [googleDefinition, googleOAuthDefinition],
        allowedDefinitionIds: ['google-service-account'],
      });

      expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue(
        'BigQuery Service Account'
      );
      expect(screen.queryByText('Which provider should I choose?')).toBeNull();
    });

    it('does not explain the provider choice when Google sign-in is unavailable', () => {
      mocks.oauthAvailable = false;
      try {
        renderForm({ definitions: [googleDefinition, googleOAuthDefinition] });

        expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue(
          'BigQuery Service Account'
        );
        expect(screen.queryByText('Which provider should I choose?')).toBeNull();
      } finally {
        mocks.oauthAvailable = true;
      }
    });

    it('sends fields and no secret when creating a fields Credential', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm({ definitions: [snowflakeDefinition], onSubmit });

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Prod' },
      });
      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ann' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          title: 'Prod',
          definitionId: 'snowflake-password',
          fields: { username: 'ann', password: 'pw' },
          availableForUse: true,
          availableForMaintenance: false,
        });
      });
    });

    it('asks for missing required fields', async () => {
      const onSubmit = vi.fn();
      renderForm({ definitions: [snowflakeDefinition], onSubmit });

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Prod' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Username is required')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('opens the collapsed Authentication section, links and focuses the missing-field error', async () => {
      localStorage.setItem('form-section-credential-authentication', 'false');
      const onSubmit = vi.fn();
      renderForm({ definitions: [snowflakeDefinition], onSubmit });
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Prod' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      const input = await screen.findByLabelText('Username');
      const error = await screen.findByText('Username is required');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input.getAttribute('aria-describedby')).toBe(error.id);
      await waitFor(() => {
        expect(input).toHaveFocus();
      });
      localStorage.removeItem('form-section-credential-authentication');
    });

    it('keeps both values when two inputs change before the form re-renders', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm({ definitions: [snowflakeDefinition], onSubmit });
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Prod' },
      });
      // Both changes go through the handler of one render, so neither sees the other's value.
      const onChange = fieldsInputs.onChange!;
      act(() => {
        onChange('username', 'ann');
        onChange('password', 'pw');
      });

      expect(screen.getByLabelText('Username')).toHaveValue('ann');
      expect(screen.getByLabelText('Password')).toHaveValue('pw');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ fields: { username: 'ann', password: 'pw' } })
        );
      });
    });

    it('links the Provider label and error to the combobox input', async () => {
      renderForm({ definitions: [] });
      const input = screen.getByRole('combobox', { name: 'Provider' });
      expect(document.getElementById(input.id)).toBe(input);
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      const message = await screen.findByText('Provider is required');
      await waitFor(() => {
        expect(input).toHaveAttribute('aria-invalid', 'true');
      });
      expect(input.getAttribute('aria-describedby')).toContain(message.id);
      expect(screen.getByText('Provider').closest('label')).toHaveAttribute('for', input.id);
    });

    it('starts both sharing switches off for defaultSharing not-shared', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm({
        definitions: [snowflakeDefinition],
        defaultSharing: 'not-shared',
        onSubmit,
      });

      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Prod' },
      });
      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ann' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ availableForUse: false, availableForMaintenance: false })
        );
      });
    });

    it('edits a fields Credential: saved secrets stay empty and untouched fields are omitted', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm({
        credential: snowflakeCredential,
        definitions: [snowflakeDefinition],
        canManageAccess: true,
        onSubmit,
      });

      expect(screen.getByLabelText('Username')).toHaveValue('ann');
      expect(screen.getByLabelText('Password')).toHaveValue('');
      expect(screen.getByLabelText('Password')).toHaveAttribute(
        'placeholder',
        'Saved. Enter a new value to replace it.'
      );
      expect(
        screen.queryByText('The new secret applies to 1 Storage that uses this Credential.')
      ).toBeNull();

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'new' } });
      expect(
        screen.getByText('The new secret applies to 1 Storage that uses this Credential.')
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ fields: { password: 'new' } });
      });
    });

    it('shows the provider icon of a saved Credential', () => {
      renderForm({
        credential: {
          ...snowflakeCredential,
          definition: { ...snowflakeDefinition, icon: 'snowflake' },
        },
        definitions: [snowflakeDefinition],
      });
      const provider = screen.getByRole('textbox', { name: 'Provider' });

      expect(provider).toBeDisabled();
      expect(provider).toHaveValue('Snowflake password');
      expect(
        provider
          .closest('[data-slot="input-group"]')
          ?.querySelector('[data-align="inline-start"] svg')
      ).toHaveAttribute('width', '16');
    });

    it('warns that the change applies to the Storages when an identity field changes', () => {
      renderForm({
        credential: snowflakeCredential,
        definitions: [snowflakeDefinition],
        canManageAccess: true,
      });
      const warning = 'The new secret applies to 1 Storage that uses this Credential.';
      expect(screen.queryByText(warning)).toBeNull();
      fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'bob' } });
      expect(screen.getByText(warning)).toBeInTheDocument();
    });

    it('blocks reconnecting while an OAuth Credential has unsaved edits', () => {
      renderForm({
        credential: {
          ...snowflakeCredential,
          definition: googleOAuthDefinition,
          publicMetadata: { account: { email: 'ann@x.io', name: null, picture: null }, scopes: [] },
        },
        definitions: [googleOAuthDefinition],
      });
      expect(screen.getByRole('button', { name: 'Authenticated as ann@x.io' })).toBeEnabled();
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Renamed' },
      });
      expect(screen.getByRole('button', { name: 'Authenticated as ann@x.io' })).toBeDisabled();
    });

    it('asks for a required field cleared on a saved Credential instead of dropping it', async () => {
      const onSubmit = vi.fn();
      renderForm({
        credential: snowflakeCredential,
        definitions: [snowflakeDefinition],
        canManageAccess: true,
        onSubmit,
      });

      fireEvent.change(screen.getByLabelText('Username'), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText('Username is required')).toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('shows Connect with Google instead of Save for a new Google account Credential', async () => {
      const onSubmit = vi.fn();
      const onOAuthConnected = vi.fn();
      const connected = { id: 'credential-2' } as Credential;
      mocks.authorize.mockResolvedValue({
        authorizationUrl: 'https://accounts.google.com/auth?state=s',
      });
      mocks.popup.mockResolvedValue({ code: 'c', state: 's' });
      mocks.exchange.mockResolvedValue(connected);
      renderForm({
        definitions: [googleOAuthDefinition],
        defaultSharing: 'not-shared',
        onSubmit,
        onOAuthConnected,
      });

      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Team' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Connect with Google' }));

      await waitFor(() => {
        expect(onOAuthConnected).toHaveBeenCalledWith(connected);
      });
      expect(mocks.exchange).toHaveBeenCalledWith({
        code: 'c',
        state: 's',
        title: 'Team',
        availableForUse: false,
        availableForMaintenance: false,
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not offer Google account when Google sign-in is unavailable', async () => {
      mocks.oauthAvailable = false;
      try {
        renderForm({
          definitions: [googleDefinition, googleOAuthDefinition],
          allowedDefinitionIds: ['google-service-account', 'google-oauth'],
          initialDefinitionId: 'google-oauth',
        });

        const input = screen.getByRole('combobox', { name: 'Provider' });
        expect(input).toHaveValue('BigQuery Service Account');
        fireEvent.mouseDown(input, { button: 0 });
        const options = await within(document.body).findAllByRole('option');
        expect(options.map(option => option.textContent)).toEqual(['BigQuery Service Account']);
      } finally {
        mocks.oauthAvailable = true;
      }
    });

    it('presets Google account once the availability settings arrive', () => {
      mocks.oauthAvailable = undefined;
      const props = {
        credential: null,
        definitions: [googleDefinition, googleOAuthDefinition],
        initialDefinitionId: 'google-oauth',
        isSaving: false,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
      };
      const ui = () => (
        <MemoryRouter>
          <CredentialForm {...props} />
        </MemoryRouter>
      );
      const { rerender } = render(ui());
      expect(screen.queryByRole('combobox', { name: 'Provider' })).toBeNull();

      mocks.oauthAvailable = true;
      rerender(ui());
      expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue(
        'BigQuery Google account'
      );
      mocks.oauthAvailable = true;
    });

    it('presets the remaining provider once settings say OAuth is unavailable', () => {
      mocks.oauthAvailable = undefined;
      const props = {
        credential: null,
        definitions: [googleDefinition, googleOAuthDefinition],
        allowedDefinitionIds: ['google-service-account', 'google-oauth'],
        initialDefinitionId: 'google-oauth',
        isSaving: false,
        onSubmit: vi.fn(),
        onCancel: vi.fn(),
      };
      const ui = () => (
        <MemoryRouter>
          <CredentialForm {...props} />
        </MemoryRouter>
      );
      const { rerender } = render(ui());
      expect(screen.queryByRole('combobox', { name: 'Provider' })).toBeNull();

      mocks.oauthAvailable = false;
      rerender(ui());
      expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue(
        'BigQuery Service Account'
      );
      mocks.oauthAvailable = true;
    });

    it('treats a whitespace-only saved optional secret as untouched', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const def: CredentialDefinition = {
        ...snowflakeDefinition,
        auth: {
          type: 'fields',
          fields: [
            {
              key: 'username',
              label: 'Username',
              input: 'text',
              secret: false,
              required: true,
              identity: true,
            },
            {
              key: 'passphrase',
              label: 'Passphrase',
              input: 'password',
              secret: true,
              required: false,
              identity: false,
            },
          ],
        },
      };
      renderForm({
        credential: { ...snowflakeCredential, definition: def },
        definitions: [def],
        onSubmit,
      });
      fireEvent.change(screen.getByLabelText('Passphrase'), { target: { value: '   ' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
        target: { value: 'Renamed' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ title: 'Renamed' });
      });
    });

    it('removes a saved optional secret with null and gives required secrets no Remove', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const awsDefinition: CredentialDefinition = {
        ...snowflakeDefinition,
        id: 'aws-access-key',
        displayName: 'AWS access key',
        auth: {
          type: 'fields',
          fields: [
            {
              key: 'accessKeyId',
              label: 'Access key ID',
              input: 'text',
              secret: false,
              required: true,
              identity: true,
            },
            {
              key: 'secretAccessKey',
              label: 'Secret access key',
              input: 'password',
              secret: true,
              required: true,
              identity: false,
            },
            {
              key: 'sessionToken',
              label: 'Session token',
              input: 'password',
              secret: true,
              required: false,
              identity: false,
            },
          ],
        },
      };
      renderForm({
        credential: {
          ...snowflakeCredential,
          definition: awsDefinition,
          publicMetadata: { fields: { accessKeyId: 'AKIA' } },
          setSecretFieldKeys: ['secretAccessKey', 'sessionToken'],
        },
        definitions: [awsDefinition],
        canManageAccess: true,
        onSubmit,
      });

      expect(screen.getAllByRole('button', { name: /^Remove/ })).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Remove Session token' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({ fields: { sessionToken: null } });
      });
    });

    it('has no Used by section for a Credential nothing uses', () => {
      renderForm({
        credential: { ...snowflakeCredential, usedBy: [] },
        definitions: [snowflakeDefinition],
        canManageAccess: true,
      });

      expect(screen.getByText('Details')).toBeInTheDocument();
      expect(screen.queryByText('Used by')).toBeNull();
    });

    it('lists the consumers in a Used by section between Sharing and Details', () => {
      renderForm({
        credential: snowflakeCredential,
        definitions: [snowflakeDefinition],
        canManageAccess: true,
      });
      const titles = ['Sharing', 'Used by', 'Details'].map(title => screen.getByText(title));
      expect(titles[0].compareDocumentPosition(titles[1])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(titles[1].compareDocumentPosition(titles[2])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

      fireEvent.click(titles[1]);
      expect(screen.getByRole('link', { name: 'Warehouse' })).toHaveAttribute(
        'href',
        '/data-storages?id=storage-1'
      );
    });
  });
});
