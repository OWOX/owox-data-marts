import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
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

function setup() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
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
});
