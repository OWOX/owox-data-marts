import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialsManager } from './CredentialsManager';

const mocks = vi.hoisted(() => ({
  refetchDefinitions: vi.fn(),
  trackEvent: vi.fn(),
  sheetProps: null as null | {
    onCreated?: (credential: unknown) => void;
    isOpen?: boolean;
    credential?: { id: string } | null;
    link?: string | null;
    onClose?: () => void;
    providerLogo?: string | null;
    promo?: ReactNode;
  },
  tableProps: null as null | { customConnectorLogos?: ReadonlyMap<string, string | null> },
  logos: new Map<string, string | null>(),
  validate: vi.fn(),
  wasErrorToastShown: vi.fn(),
  toastError: vi.fn(),
  user: { id: 'u1', projectId: 'project-1', roles: ['admin'] } as {
    id: string;
    projectId?: string;
    roles: string[];
  },
  mcp: true,
  state: {
    definitions: [] as unknown[],
    credentials: [] as unknown[],
    isError: true,
    listError: false,
    refetchError: false,
  },
}));

vi.mock('../../utils/data-layer', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('../../app/api', () => ({ wasErrorToastShown: mocks.wasErrorToastShown }));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: mocks.toastError, success: vi.fn() }),
}));

vi.mock('../idp', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../mcp-promo', () => ({
  useIsMcpSetupPromoAvailable: () => mocks.mcp,
  McpPromoCard: (props: { placement: string; prompt: string; variant?: string }) => (
    <div data-testid='promo' data-variant={props.variant}>
      {`${props.placement}|${props.prompt}`}
    </div>
  ),
  buildMcpPrompt: (placement: string, ids: { projectId: string }) =>
    `${placement}:${ids.projectId}`,
}));
vi.mock('./useCustomConnectorLogos', () => ({ useCustomConnectorLogos: () => mocks.logos }));
vi.mock('./components/CredentialConfigSheet', () => ({
  CredentialConfigSheet: (props: NonNullable<typeof mocks.sheetProps>) => {
    mocks.sheetProps = props;
    return props.isOpen ? <>{props.promo}</> : null;
  },
  CredentialUsedByList: () => null,
}));
vi.mock('./CredentialsTable', () => ({
  CredentialsTable: (props: {
    onValidate: (credential: unknown) => void;
    onEdit: (credential: unknown) => void;
    onAddCredential: () => void;
    customConnectorLogos?: ReadonlyMap<string, string | null>;
  }) => {
    mocks.tableProps = props;
    const { onValidate, onEdit, onAddCredential } = props;
    return (
      <>
        <button
          onClick={() => {
            onValidate({ id: 'c1' });
          }}
        >
          Validate Credential
        </button>
        <button
          onClick={() => {
            onEdit({ id: 'c1' });
          }}
        >
          Edit Credential
        </button>
        <button onClick={onAddCredential}>Add from table</button>
      </>
    );
  },
}));
vi.mock('./useCredentials', () => ({
  useCredentialActions: () => ({ validate: mocks.validate }),
  useCredentials: () => ({
    credentials: mocks.state.credentials,
    unavailableCredentials: [],
    isLoading: false,
    isError: mocks.state.listError || mocks.state.refetchError,
    isLoadingError: mocks.state.listError,
    refetch: vi.fn(),
  }),
  useCredentialDefinitions: () => ({
    definitions: mocks.state.definitions,
    isLoading: false,
    isError: mocks.state.isError,
    refetch: mocks.refetchDefinitions,
  }),
}));

const LOGO = 'data:image/png;base64,AAAA';

function Search() {
  return <span data-testid='search'>{useLocation().search}</span>;
}

function renderManager(path = '/ui/p1/credentials') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CredentialsManager />
      <Search />
    </MemoryRouter>
  );
}

describe('CredentialsManager', () => {
  beforeEach(() => {
    mocks.state = {
      definitions: [],
      credentials: [],
      isError: true,
      listError: false,
      refetchError: false,
    };
    mocks.user = { id: 'u1', projectId: 'project-1', roles: ['admin'] };
    mocks.mcp = true;
    mocks.trackEvent.mockReset();
    mocks.toastError.mockReset();
    mocks.sheetProps = null;
    mocks.tableProps = null;
    mocks.logos = new Map();
  });

  it('passes the logo map to the table', () => {
    mocks.state.isError = false;
    mocks.state.credentials = [{ id: 'c1' }];
    mocks.logos = new Map([['c1', LOGO]]);
    renderManager();

    expect(mocks.tableProps?.customConnectorLogos).toBe(mocks.logos);
  });

  it('tracks a Source Credential created on the page as coming from the Credentials page', () => {
    mocks.state.isError = false;
    renderManager();

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
    renderManager();

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
    renderManager();

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
      renderManager();

      fireEvent.click(await screen.findByRole('button', { name: 'Validate Credential' }));

      await waitFor(() => {
        expect(mocks.validate).toHaveBeenCalled();
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mocks.toastError).toHaveBeenCalledTimes(count);
    }
  );

  it('says the providers failed to load and retries them', () => {
    renderManager();

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load providers.');
    expect(screen.getByRole('button', { name: 'Add Credential' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.refetchDefinitions).toHaveBeenCalled();
  });

  describe('sheet link', () => {
    beforeEach(() => {
      mocks.state.isError = false;
      mocks.state.credentials = [{ id: 'c1', definition: { auth: { type: 'secret' } } }];
    });

    it('opens the sheet for the Credential named in the URL', () => {
      renderManager('/ui/p1/credentials?credential=c1');

      expect(mocks.sheetProps?.isOpen).toBe(true);
      expect(mocks.sheetProps?.credential).toMatchObject({ id: 'c1' });
      expect(mocks.sheetProps?.link).toContain('?credential=c1');
    });

    it('writes the id to the URL on Edit and removes it on close', () => {
      renderManager();
      expect(mocks.sheetProps?.isOpen).toBe(false);

      fireEvent.click(screen.getByRole('button', { name: 'Edit Credential' }));
      expect(screen.getByTestId('search')).toHaveTextContent('?credential=c1');
      expect(mocks.sheetProps?.isOpen).toBe(true);

      act(() => {
        mocks.sheetProps?.onClose?.();
      });
      expect(screen.getByTestId('search')).toHaveTextContent('');
      expect(mocks.sheetProps?.isOpen).toBe(false);
    });

    it('toasts and removes the parameter for an unknown id', () => {
      renderManager('/ui/p1/credentials?credential=zz');

      expect(mocks.toastError).toHaveBeenCalledWith(
        'This Credential was deleted or you cannot change it.',
        { id: 'credential-not-found' }
      );
      expect(screen.getByTestId('search')).toHaveTextContent('');
      expect(mocks.sheetProps?.isOpen).toBe(false);
    });

    it('does not open the sheet from a link for a member who can only use the Credential', () => {
      mocks.user = { id: 'u2', roles: [] };
      mocks.state.credentials = [{ id: 'c1', ownerUsers: [], availableForMaintenance: false }];
      renderManager('/ui/p1/credentials?credential=c1');

      expect(mocks.toastError).toHaveBeenCalledWith(
        'This Credential was deleted or you cannot change it.',
        { id: 'credential-not-found' }
      );
      expect(screen.getByTestId('search')).toHaveTextContent('');
      expect(mocks.sheetProps?.isOpen).toBe(false);
    });

    it('opens the sheet from a link for a member who can maintain the Credential', () => {
      mocks.user = { id: 'u2', roles: [] };
      mocks.state.credentials = [{ id: 'c1', ownerUsers: [], availableForMaintenance: true }];
      renderManager('/ui/p1/credentials?credential=c1');

      expect(mocks.sheetProps?.isOpen).toBe(true);
    });

    it('keeps the parameter without a toast when the list fails to load', () => {
      mocks.state.listError = true;
      renderManager('/ui/p1/credentials?credential=c1');

      expect(mocks.toastError).not.toHaveBeenCalled();
      expect(screen.getByTestId('search')).toHaveTextContent('?credential=c1');
      expect(mocks.sheetProps?.isOpen).toBe(false);
    });

    it('keeps the open sheet when a background refetch fails with data present', () => {
      const ui = (
        <MemoryRouter initialEntries={['/ui/p1/credentials?credential=c1']}>
          <CredentialsManager />
          <Search />
        </MemoryRouter>
      );
      const { rerender } = render(ui);
      expect(mocks.sheetProps?.isOpen).toBe(true);

      mocks.state.refetchError = true;
      rerender(ui);

      expect(mocks.sheetProps?.isOpen).toBe(true);
      expect(mocks.sheetProps?.credential).toMatchObject({ id: 'c1' });
      expect(screen.getByTestId('search')).toHaveTextContent('?credential=c1');
      expect(mocks.toastError).not.toHaveBeenCalled();
    });

    it("passes the open Credential's logo to the sheet", () => {
      mocks.logos = new Map([['c1', LOGO]]);
      renderManager();

      fireEvent.click(screen.getByRole('button', { name: 'Add from table' }));
      expect(mocks.sheetProps?.credential).toBeNull();
      expect(mocks.sheetProps?.providerLogo).toBeUndefined();
      act(() => {
        mocks.sheetProps?.onClose?.();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Edit Credential' }));
      expect(mocks.sheetProps?.credential).toMatchObject({ id: 'c1' });
      expect(mocks.sheetProps?.providerLogo).toBe(LOGO);
    });

    it('opens the create sheet without writing the URL', () => {
      renderManager();

      fireEvent.click(screen.getByRole('button', { name: 'Add from table' }));
      expect(mocks.sheetProps?.isOpen).toBe(true);
      expect(mocks.sheetProps?.credential).toBeNull();
      expect(screen.getByTestId('search')).toHaveTextContent('');

      act(() => {
        mocks.sheetProps?.onClose?.();
      });
      expect(mocks.sheetProps?.isOpen).toBe(false);
    });
  });

  describe('AI assistant promo', () => {
    beforeEach(() => {
      mocks.state.isError = false;
      mocks.state.credentials = [{ id: 'c1' }];
    });

    it('shows the promo when adding a Credential, not when editing one', () => {
      renderManager();

      fireEvent.click(screen.getByRole('button', { name: 'Edit Credential' }));
      expect(mocks.sheetProps?.isOpen).toBe(true);
      expect(screen.queryByTestId('promo')).toBeNull();
      act(() => {
        mocks.sheetProps?.onClose?.();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Add from table' }));
      expect(screen.getByTestId('promo').textContent).toBe(
        'credential_sheet|credential_sheet:project-1'
      );
      expect(screen.getByTestId('promo')).toHaveAttribute('data-variant', 'section');
    });

    it('does not give the add sheet the promo without an MCP server', () => {
      mocks.mcp = false;
      renderManager();

      fireEvent.click(screen.getByRole('button', { name: 'Add from table' }));
      expect(mocks.sheetProps?.isOpen).toBe(true);
      expect(mocks.sheetProps).toHaveProperty('promo', undefined);
    });

    it('does not give a sheet opened from a link the promo', () => {
      renderManager('/ui/p1/credentials?credential=c1');

      expect(mocks.sheetProps?.isOpen).toBe(true);
      expect(mocks.sheetProps).toHaveProperty('promo', undefined);
    });
  });
});
