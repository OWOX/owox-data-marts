import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialsManager } from './CredentialsManager';

const mocks = vi.hoisted(() => ({
  refetchDefinitions: vi.fn(),
  trackEvent: vi.fn(),
  sheetProps: null as null | { onCreated?: (credential: unknown) => void },
  validate: vi.fn(),
  wasErrorToastShown: vi.fn(),
  toastError: vi.fn(),
  state: { definitions: [] as unknown[], credentials: [] as unknown[], isError: true },
}));

vi.mock('../../utils/data-layer', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('../../app/api', () => ({ wasErrorToastShown: mocks.wasErrorToastShown }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: mocks.toastError, success: vi.fn() }),
}));

vi.mock('../idp', () => ({ useAuth: () => ({ user: { id: 'u1', roles: ['admin'] } }) }));
vi.mock('./components/CredentialConfigSheet', () => ({
  CredentialConfigSheet: (props: { onCreated?: (credential: unknown) => void }) => {
    mocks.sheetProps = props;
    return null;
  },
  CredentialUsedByList: () => null,
}));
vi.mock('./CredentialsTable', () => ({
  CredentialsTable: ({ onValidate }: { onValidate: (credential: unknown) => void }) => (
    <button
      onClick={() => {
        onValidate({ id: 'c1' });
      }}
    >
      Validate Credential
    </button>
  ),
}));
vi.mock('./useCredentials', () => ({
  useCredentialActions: () => ({ validate: mocks.validate }),
  useCredentials: () => ({
    credentials: mocks.state.credentials,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCredentialDefinitions: () => ({
    definitions: mocks.state.definitions,
    isLoading: false,
    isError: mocks.state.isError,
    refetch: mocks.refetchDefinitions,
  }),
}));

describe('CredentialsManager', () => {
  beforeEach(() => {
    mocks.state = { definitions: [], credentials: [], isError: true };
    mocks.trackEvent.mockReset();
    mocks.toastError.mockReset();
    mocks.sheetProps = null;
  });

  it('tracks a Source Credential created on the page as coming from the Credentials page', () => {
    mocks.state.isError = false;
    render(<CredentialsManager />);

    mocks.sheetProps?.onCreated?.({
      id: 'c1',
      definition: { id: 'source:FacebookMarketing:oauth2', connectors: ['FacebookMarketing'] },
    });

    expect(mocks.trackEvent).toHaveBeenCalledWith({
      event: 'connector_credential_created',
      category: 'Connector',
      action: 'source:FacebookMarketing:oauth2',
      label: 'FacebookMarketing',
      context: 'credentials-page',
      value: null,
    });
  });

  it('tracks a custom connector Credential, which names no served connector', () => {
    mocks.state.isError = false;
    render(<CredentialsManager />);

    mocks.sheetProps?.onCreated?.({
      id: 'c3',
      definition: { id: 'custom-connector', auth: { type: 'custom-connector' } },
    });

    expect(mocks.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'connector_credential_created',
        label: 'custom connector',
        context: 'credentials-page',
      })
    );
  });

  it('does not track a Storage Credential created on the page', () => {
    mocks.state.isError = false;
    render(<CredentialsManager />);

    mocks.sheetProps?.onCreated?.({ id: 'c2', definition: { id: 'google-service-account' } });

    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it.each([
    [true, 0],
    [false, 1],
  ])(
    'with the interceptor toast shown=%s a failed validate toasts %s time(s)',
    async (shown, count) => {
      mocks.state.isError = false;
      mocks.state.credentials = [{ id: 'c1' }];
      mocks.wasErrorToastShown.mockReturnValue(shown);
      mocks.validate.mockRejectedValue(new Error('boom'));
      render(<CredentialsManager />);

      fireEvent.click(await screen.findByRole('button', { name: 'Validate Credential' }));

      await waitFor(() => {
        expect(mocks.validate).toHaveBeenCalled();
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mocks.toastError).toHaveBeenCalledTimes(count);
    }
  );

  it('says the providers failed to load and retries them', () => {
    render(<CredentialsManager />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load providers.');
    expect(screen.getByRole('button', { name: 'Add Credential' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refetchDefinitions).toHaveBeenCalled();
  });
});
