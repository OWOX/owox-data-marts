import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Credential } from './types';
import { onCredentialSaved, useCredentialActions } from './useCredentials';

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  update: vi.fn(),
  validate: vi.fn(),
  exchange: vi.fn(),
  consent: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../../shared/hooks', () => ({ useProjectId: () => 'project-1' }));
vi.mock('./credentials.service', () => ({
  credentialsService: {
    update: mocks.update,
    validate: mocks.validate,
    exchangeGoogleOAuth: mocks.exchange,
    consentDefinition: mocks.consent,
    create: mocks.create,
  },
}));

const consumer = (consumerType: string, consumerId: string) => ({
  consumerType,
  consumerId,
  requirementKey: 'storage',
  lastUsedAt: null,
});
const saved = {
  id: 'credential-1',
  usedBy: [consumer('storage', 'storage-1'), consumer('plugin', 'plugin-1')],
} as unknown as Credential;

function setup(client = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCredentialActions(), { wrapper }).result;
}

describe('useCredentialActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onCredentialSaved(mocks.invalidate);
    for (const mock of [
      mocks.update,
      mocks.validate,
      mocks.exchange,
      mocks.consent,
      mocks.create,
    ]) {
      mock.mockResolvedValue(saved);
    }
  });

  it.each([
    [
      'update',
      (r: ReturnType<typeof setup>) => r.current.update({ id: 'credential-1', input: {} }),
    ],
    ['validate', (r: ReturnType<typeof setup>) => r.current.validate('credential-1')],
    [
      'exchange',
      (r: ReturnType<typeof setup>) => r.current.exchangeGoogleOAuth({ code: 'c', state: 's' }),
    ],
    ['consent', (r: ReturnType<typeof setup>) => r.current.consentDefinition('credential-1')],
  ])('tells the listeners about the saved Credential after %s', async (_name, run) => {
    const result = setup();
    await act(async () => {
      await run(result);
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledWith(saved);
  });

  it.each(['create', 'update', 'exchange'] as const)(
    'drops %s secrets from the mutation cache after success or failure while mounted',
    async action => {
      const client = new QueryClient();
      const result = setup(client);
      const run = () => {
        if (action === 'exchange') {
          return result.current.exchangeGoogleOAuth({ code: 'private-code', state: 'oauth-state' });
        }
        const input = { title: 'Key', definitionId: 'github', secret: { value: 'private-token' } };
        return action === 'create'
          ? result.current.create(input)
          : result.current.update({ id: saved.id, input });
      };

      await act(async () => {
        await expect(run()).resolves.toBe(saved);
      });
      await waitFor(() => {
        expect(client.getMutationCache().getAll()).toHaveLength(0);
      });
      const error = new Error('Save failed');
      mocks[action].mockRejectedValueOnce(error);
      await act(async () => {
        await expect(run()).rejects.toBe(error);
      });
      await waitFor(() => {
        expect(client.getMutationCache().getAll()).toHaveLength(0);
      });
    }
  );

  it('keeps saving state and listener invalidation until an update completes', async () => {
    let finish!: (credential: Credential) => void;
    mocks.update.mockImplementation(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const result = setup();
    let request!: Promise<Credential>;
    await act(async () => {
      request = result.current.update({
        id: saved.id,
        input: { secret: { value: 'private-token' } },
      });
    });
    await waitFor(() => {
      expect(result.current.isSaving).toBe(true);
    });
    expect(mocks.invalidate).not.toHaveBeenCalled();

    await act(async () => {
      finish(saved);
      await request;
    });

    await waitFor(() => {
      expect(result.current.isSaving).toBe(false);
    });
    expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(saved);
  });
});
