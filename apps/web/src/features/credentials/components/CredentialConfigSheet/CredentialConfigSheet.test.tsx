import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Credential, CredentialDefinition } from '../../types';
import { CredentialConfigSheet } from './CredentialConfigSheet';

const create = vi.hoisted(() => vi.fn());
const mocks = vi.hoisted(() => ({ wasErrorToastShown: vi.fn(), toastError: vi.fn() }));
vi.mock('../../../../app/api', () => ({ wasErrorToastShown: mocks.wasErrorToastShown }));
vi.mock('react-hot-toast', () => ({
  default: { error: mocks.toastError, success: vi.fn() },
}));
vi.mock('../../useCredentials', () => ({
  useGoogleOAuthAvailable: () => true,
  useCredentialActions: () => ({
    create,
    update: vi.fn(),
    addGithubDefinition: vi.fn(),
    isSaving: false,
  }),
}));

// The form has its own spec; here it only submits.
vi.mock('./CredentialForm', () => ({
  CredentialForm: ({ onSubmit }: { onSubmit: (input: unknown) => Promise<void> }) => (
    <button type='button' onClick={() => void onSubmit({ title: 'Key' })}>
      Submit Credential
    </button>
  ),
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
  connectors: [],
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

  it('reports a created Credential before it closes', async () => {
    create.mockResolvedValue({ id: 'cred-1', validationState: 'unknown' } as Credential);
    const calls: string[] = [];
    render(
      <CredentialConfigSheet
        isOpen
        onClose={() => calls.push('close')}
        onCreated={() => calls.push('created')}
        credential={null}
        definitions={[definition]}
      />
    );

    screen.getByRole('button', { name: 'Submit Credential' }).click();

    await waitFor(() => {
      expect(calls).toEqual(['created', 'close']);
    });
  });

  it.each([
    [true, 0],
    [false, 1],
  ])(
    'with the interceptor toast shown=%s a failed save toasts %s time(s)',
    async (shown, count) => {
      mocks.toastError.mockReset();
      mocks.wasErrorToastShown.mockReturnValue(shown);
      create.mockRejectedValue(new Error('boom'));
      render(
        <CredentialConfigSheet
          isOpen
          onClose={vi.fn()}
          credential={null}
          definitions={[definition]}
        />
      );

      screen.getByRole('button', { name: 'Submit Credential' }).click();

      await waitFor(() => {
        expect(create).toHaveBeenCalled();
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      await waitFor(() => {
        expect(mocks.toastError).toHaveBeenCalledTimes(count);
      });
    }
  );
});
