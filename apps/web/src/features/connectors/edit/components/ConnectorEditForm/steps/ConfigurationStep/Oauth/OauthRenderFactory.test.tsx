import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OauthRenderFactory, type OauthRenderComponentProps } from './OauthRenderFactory';
import type { ConnectorSpecificationResponseApiDto } from '../../../../../../shared/api/types';
import { CredentialSetupRecoveryContext } from '../../../../../../../credentials/credential-setup-recovery';

const mocks = vi.hoisted(() => ({
  exchangeCredentials: vi.fn(),
  checkStatus: vi.fn(),
  getSettings: vi.fn(),
  onOAuthSuccess: undefined as OauthRenderComponentProps['onOAuthSuccess'] | undefined,
}));
vi.mock('../../../../../../shared/model/hooks/useOAuth', () => ({ useOAuth: () => mocks }));
vi.mock('./impl/FacebookOauthRender', () => ({
  FacebookOauthRender: ({ onOAuthSuccess }: OauthRenderComponentProps) => {
    mocks.onOAuthSuccess = onOAuthSuccess;
    return <button>Connect Facebook</button>;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.onOAuthSuccess = undefined;
  mocks.getSettings.mockResolvedValue({ isEnabled: true });
  mocks.exchangeCredentials.mockResolvedValue({ credentialId: 'credential-1' });
});

describe('Source OAuth callback', () => {
  it('records a saved setup Credential after unmount without invoking UI callbacks', async () => {
    let finishExchange!: (value: { credentialId: string }) => void;
    mocks.exchangeCredentials.mockImplementation(
      () =>
        new Promise(resolve => {
          finishExchange = resolve;
        })
    );
    const onValueChange = vi.fn();
    const onExchanged = vi.fn();
    const recordSave = vi.fn();
    const view = render(
      <CredentialSetupRecoveryContext.Provider value={recordSave}>
        <OauthRenderFactory
          specification={{ name: 'Credentials' } as ConnectorSpecificationResponseApiDto}
          configuration={{}}
          connectorName='FacebookMarketing'
          credential={{ title: 'Facebook account' }}
          onValueChange={onValueChange}
          onExchanged={onExchanged}
        />
      </CredentialSetupRecoveryContext.Provider>
    );
    await waitFor(() => {
      expect(mocks.onOAuthSuccess).toBeDefined();
    });
    let exchange!: Promise<unknown>;
    await act(async () => {
      exchange = mocks.onOAuthSuccess!({ accessToken: 'provider-token' });
    });
    view.unmount();

    await act(async () => {
      finishExchange({ credentialId: 'saved-source-credential' });
      await exchange;
    });

    expect(recordSave).toHaveBeenCalledWith('saved-source-credential', true);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onExchanged).not.toHaveBeenCalled();
  });

  it('ignores a provider callback after the form closes', async () => {
    const onValueChange = vi.fn();
    const onExchanged = vi.fn();
    const view = render(
      <OauthRenderFactory
        specification={{ name: 'Credentials' } as ConnectorSpecificationResponseApiDto}
        configuration={{}}
        connectorName='FacebookMarketing'
        onValueChange={onValueChange}
        onExchanged={onExchanged}
      />
    );
    await waitFor(() => {
      expect(mocks.getSettings).toHaveBeenCalled();
    });
    const onOAuthSuccess = mocks.onOAuthSuccess;
    view.unmount();

    await act(async () => {
      await onOAuthSuccess?.({ accessToken: 'provider-token' });
    });

    expect(mocks.exchangeCredentials).not.toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onExchanged).not.toHaveBeenCalled();
  });

  it('keeps the provider finish step active and records recovery if that step is interrupted', async () => {
    let finish!: () => void;
    const beforeFinish = () =>
      new Promise<void>(resolve => {
        finish = resolve;
      });
    const onExchanged = vi.fn();
    const recordSave = vi.fn();
    const view = render(
      <CredentialSetupRecoveryContext.Provider value={recordSave}>
        <OauthRenderFactory
          specification={{ name: 'Credentials' } as ConnectorSpecificationResponseApiDto}
          configuration={{}}
          connectorName='FacebookMarketing'
          credential={{ title: 'Facebook account' }}
          onValueChange={vi.fn()}
          onExchanged={onExchanged}
        />
      </CredentialSetupRecoveryContext.Provider>
    );
    await waitFor(() => {
      expect(mocks.onOAuthSuccess).toBeDefined();
    });
    let exchange!: Promise<unknown>;
    await act(async () => {
      exchange = mocks.onOAuthSuccess!({ accessToken: 'provider-token' }, beforeFinish);
    });
    expect(recordSave).toHaveBeenCalledWith('credential-1', false);
    expect(onExchanged).not.toHaveBeenCalled();
    view.unmount();

    await act(async () => {
      finish();
      await exchange;
    });

    expect(recordSave).toHaveBeenLastCalledWith('credential-1', true);
    expect(onExchanged).not.toHaveBeenCalled();
  });
});
