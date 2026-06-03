import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestAccessContext } from '../../features/user-provisioning/services/user-provisioning.service';
import { RequestAccessPage } from './RequestAccessPage';

const signInMock = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => ({
  value: {
    status: 'authenticated',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      roles: [],
      projectId: 'main-project',
      projectTitle: 'Main Project',
    },
    signOut: vi.fn(),
  },
}));
const requestAccessContextMock = vi.hoisted(() => ({
  value: {
    context: null as RequestAccessContext | null,
    loading: false,
    error: null as string | null,
    refresh: vi.fn(),
  },
}));
const userProvisioningServiceMock = vi.hoisted(() => ({
  requestAccess: vi.fn(),
  createNewProject: vi.fn(),
}));

vi.mock('../../features/idp', () => ({
  useAuth: () => authMock.value,
}));

vi.mock('../../features/idp/services', () => ({
  signIn: signInMock,
}));

vi.mock('../../features/user-provisioning/hooks/useRequestAccessContext', () => ({
  useRequestAccessContext: () => requestAccessContextMock.value,
}));

vi.mock('../../features/user-provisioning/services/user-provisioning.service', () => ({
  userProvisioningService: userProvisioningServiceMock,
}));

vi.mock('@owox/ui/components/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { value: string; children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
    <button id={id} type='button'>
      {children}
    </button>
  ),
  SelectValue: () => null,
}));

describe('RequestAccessPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    requestAccessContextMock.value = {
      context: context(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    };
  });

  it('renders as a regular app page with request access content', () => {
    const { container } = render(<RequestAccessPage />);

    expect(container.querySelector('.dm-page')).toBeInTheDocument();
    expect(container.querySelector('.dm-card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Request project access' })).toBeInTheDocument();
    expect(screen.getByText('owox.com · OWOX')).toBeInTheDocument();
    expect(screen.getByText('a.marchenko.dev@owox.com')).toBeInTheDocument();
    expect(screen.getByText('OWOX')).toBeInTheDocument();
    expect(screen.getByText('owox.com')).toBeInTheDocument();
    expect(screen.getByText('Business User')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create new project/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Request access/ })).toBeInTheDocument();
    expect(screen.queryByText('Request access to existing project')).not.toBeInTheDocument();
  });

  it('submits an access request and refreshes context', async () => {
    userProvisioningServiceMock.requestAccess.mockResolvedValueOnce({
      userId: 'user-1',
      projectId: 'main-project',
      projectTitle: 'OWOX',
      request: {
        role: 'viewer',
        status: 'processing',
      },
    });

    render(<RequestAccessPage />);

    fireEvent.click(screen.getByRole('button', { name: /Request access/ }));

    await waitFor(() => {
      expect(userProvisioningServiceMock.requestAccess).toHaveBeenCalledWith('viewer');
    });
    expect(requestAccessContextMock.value.refresh).toHaveBeenCalled();
    expect(await screen.findByText('Access request submitted')).toBeInTheDocument();
  });

  it('shows an existing request as submitted state', () => {
    requestAccessContextMock.value = {
      ...requestAccessContextMock.value,
      context: context({
        existingRequest: {
          role: 'editor',
          status: 'processing',
        },
      }),
    };

    render(<RequestAccessPage />);

    expect(screen.getByText('Access request submitted')).toBeInTheDocument();
    expect(screen.getByText('Requested role: Technical User')).toBeInTheDocument();
    expect(screen.getByText('processing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Request access/ })).not.toBeInTheDocument();
  });

  it('creates a new project and starts sign-in for it', async () => {
    userProvisioningServiceMock.createNewProject.mockResolvedValueOnce({
      projectId: 'new-project',
      projectTitle: 'New Project',
    });

    render(<RequestAccessPage />);

    fireEvent.click(screen.getByRole('button', { name: /Create new project/ }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith({
        projectId: 'new-project',
        redirect: '/ui/new-project/data-marts',
      });
    });
  });
});

function context(overrides: Partial<RequestAccessContext> = {}): RequestAccessContext {
  return {
    decision: 'request_access',
    user: {
      userId: 'user-1',
      email: 'a.marchenko.dev@owox.com',
    },
    organization: {
      name: 'owox.com',
    },
    project: {
      projectId: 'main-project',
      projectTitle: 'OWOX',
    },
    availableRoles: ['viewer', 'editor', 'admin'],
    defaultRole: 'viewer',
    existingRequest: null,
    ...overrides,
  };
}
