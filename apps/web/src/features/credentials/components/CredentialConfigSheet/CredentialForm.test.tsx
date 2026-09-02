import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Credential, CredentialDefinition } from '../../types';
import { CredentialForm } from './CredentialForm';

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
    <CredentialForm
      credential={null}
      definitions={[openAiDefinition]}
      isSaving={false}
      onSubmit={vi.fn().mockResolvedValue(undefined)}
      onCancel={vi.fn()}
      {...overrides}
    />
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

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Provider' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
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

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Provider' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
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

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Provider' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
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

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Provider' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
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
});
