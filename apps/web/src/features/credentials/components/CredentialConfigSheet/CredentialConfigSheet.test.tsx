import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CredentialDefinition } from '../../types';
import { CredentialConfigSheet } from './CredentialConfigSheet';

vi.mock('../../useCredentials', () => ({
  useCredentialActions: () => ({
    create: vi.fn(),
    update: vi.fn(),
    addGithubDefinition: vi.fn(),
    isSaving: false,
  }),
}));

vi.mock('../../../contexts/components/ContextPicker/ContextPicker', () => ({
  ContextPicker: () => null,
}));

vi.mock('../../../../shared/components/OwnersSection/OwnersSection', () => ({
  OwnersSection: () => null,
}));

const definition: CredentialDefinition = {
  id: 'github',
  source: 'builtin',
  displayName: 'GitHub',
  description: 'GitHub token',
  documentationUrl: null,
  secretLabel: 'Personal access token',
  origins: ['https://api.github.com'],
  supportsAi: false,
  ai: null,
  compatibilityLine: null,
};

describe('CredentialConfigSheet', () => {
  it('renders Add Credential as a standard side Sheet', () => {
    render(
      <CredentialConfigSheet
        isOpen
        onClose={vi.fn()}
        credential={null}
        definitions={[definition]}
      />
    );

    expect(screen.getByTestId('credentialConfigSheet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add Credential' })).toBeInTheDocument();
  });
});
