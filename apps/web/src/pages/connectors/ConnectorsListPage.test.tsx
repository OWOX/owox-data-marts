import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectorsListPage } from './ConnectorsListPage';
import type { User } from '../../features/idp/types';

// The table gates create/delete on the signed-in user's role, and useAuth throws without a
// provider. These cases are about routing, so they run as an editor; the role matrix itself
// is covered in ConnectorsTable.test.tsx.
const authUser = vi.hoisted(() => ({ value: null as User | null }));
vi.mock('../../features/idp/hooks/useAuthState', () => ({
  useAuthState: () => ({ isLoading: false }),
  useUser: () => authUser.value,
  useIsAuthenticated: () => authUser.value !== null,
  useAuthActions: () => ({}),
}));

const list = vi.fn();
const softDelete = vi.fn();
vi.mock('../../features/connector-builder/shared/api/connector-builder-api.service', () => ({
  ConnectorBuilderApiService: class {
    list = list;
    softDelete = softDelete;
  },
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

// The page must navigate via the PROJECT-SCOPED hook so the builder routes
// (which live under /ui/:projectId) get the project prefix. Mocking it as the
// scoped navigate proves the page does not fall back to a raw useNavigate that
// would drop the prefix and 404.
const mockNavigate = vi.fn();
vi.mock('../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ navigate: mockNavigate, scope: (p: string) => p, projectId: 'p1' }),
}));

describe('ConnectorsListPage', () => {
  beforeEach(() => {
    list.mockReset();
    softDelete.mockReset();
    mockNavigate.mockReset();
    authUser.value = { id: 'u-1', projectId: 'p1', roles: ['editor'] };
  });

  it('renders connectors from the service', async () => {
    list.mockResolvedValue([
      {
        id: 'c1',
        name: 'acme',
        title: 'Acme',
        description: null,
        logo: null,
        docUrl: null,
        activeVersionId: 'v2',
        activeVersion: 2,
      },
    ]);
    render(<ConnectorsListPage />);
    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Published · v2')).toBeInTheDocument();
  });

  it('CTA navigates to the builder new route', async () => {
    list.mockResolvedValue([
      {
        id: 'c1',
        name: 'acme',
        title: 'Acme',
        description: null,
        logo: null,
        docUrl: null,
        activeVersionId: 'v2',
        activeVersion: 2,
      },
    ]);
    render(<ConnectorsListPage />);
    await screen.findByText('Acme');
    fireEvent.click(screen.getByRole('button', { name: 'New connector' }));
    expect(mockNavigate).toHaveBeenCalledWith('/connectors/builder/new');
  });

  it('opening a connector navigates to its project-scoped builder route', async () => {
    list.mockResolvedValue([
      {
        id: 'c1',
        name: 'acme',
        title: 'Acme',
        description: null,
        logo: null,
        docUrl: null,
        activeVersionId: 'v2',
        activeVersion: 2,
      },
    ]);
    render(<ConnectorsListPage />);
    // Clicking the row opens the connector (row click → onOpen → scoped navigate).
    fireEvent.click(await screen.findByText('Acme'));
    expect(mockNavigate).toHaveBeenCalledWith('/connectors/builder/c1');
  });

  it('shows the empty state when there are none', async () => {
    list.mockResolvedValue([]);
    render(<ConnectorsListPage />);
    expect(await screen.findByText('No custom connectors yet')).toBeInTheDocument();
  });
});
