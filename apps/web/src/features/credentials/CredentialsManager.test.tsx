import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CredentialsManager } from './CredentialsManager';

const mocks = vi.hoisted(() => ({ refetchDefinitions: vi.fn() }));

vi.mock('../idp', () => ({ useAuth: () => ({ user: { id: 'u1', roles: ['admin'] } }) }));
vi.mock('./components/CredentialConfigSheet', () => ({
  CredentialConfigSheet: () => null,
  CredentialUsedByList: () => null,
}));
vi.mock('./useCredentials', () => ({
  useCredentialActions: () => ({}),
  useCredentials: () => ({ credentials: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCredentialDefinitions: () => ({
    definitions: [],
    isLoading: false,
    isError: true,
    refetch: mocks.refetchDefinitions,
  }),
}));

describe('CredentialsManager', () => {
  it('says the providers failed to load and retries them', () => {
    render(<CredentialsManager />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load providers.');
    expect(screen.getByRole('button', { name: 'Add Credential' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refetchDefinitions).toHaveBeenCalled();
  });
});
