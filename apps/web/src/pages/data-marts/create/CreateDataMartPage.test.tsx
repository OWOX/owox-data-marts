// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  trackEvent: vi.fn(),
  mcpServerUrl: undefined as string | undefined,
  canEdit: true,
}));

vi.mock('../../../features/idp', () => ({
  useAuth: () => ({ user: { mcpServerUrl: mocks.mcpServerUrl } }),
  useRole: () => ({ canEdit: mocks.canEdit }),
}));
vi.mock('../../../utils/data-layer', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('../../../shared/hooks', () => ({
  useProjectRoute: () => ({ navigate: mocks.navigate, projectId: 'project-1' }),
}));
vi.mock('../../../features/data-marts/shared/utils/useDataMartPreset', () => ({
  useDataMartPreset: () => null,
}));
vi.mock('../../../features/data-marts/shared/utils/useConnectorNameParam', () => ({
  useConnectorNameParam: () => null,
}));
vi.mock('../../../features/data-storage/shared/model/context', () => ({
  DataStorageProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../features/data-marts/edit', () => ({
  DataMartProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DataMartCreateForm: ({ onSuccess }: { onSuccess: (r: { id: string }) => void }) => (
    <div data-testid='create-form'>
      <button
        onClick={() => {
          onSuccess({ id: 'dm-new' });
        }}
      >
        create
      </button>
    </div>
  ),
}));

import CreateDataMartPage from './CreateDataMartPage';

describe('CreateDataMartPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.mcpServerUrl = 'https://mcp.example.com';
    mocks.canEdit = true;
  });

  it('shows the AI assistant line under the form with the project id in the prompt', () => {
    render(<CreateDataMartPage />);

    const line = screen.getByTestId('create-form').nextElementSibling as HTMLElement;
    expect(line).toHaveTextContent('Or finish this in');
    const claude = within(line).getByRole('link', { name: /^Claude/ });
    expect(decodeURIComponent(claude.getAttribute('href') ?? '')).toContain(
      'help me create a Data Mart in project project-1.'
    );
    expect(within(line).getByRole('link', { name: /^ChatGPT/ })).toBeInTheDocument();
    fireEvent.click(claude);
    const clicked = mocks.trackEvent.mock.calls.filter(([p]) => p.event === 'mcp_promo_clicked');
    expect(clicked.map(([p]) => [p.label, p.value])).toEqual([['create_data_mart', 'claude']]);
  });

  it('sends one shown event with its placement', () => {
    render(<CreateDataMartPage />);

    const shown = mocks.trackEvent.mock.calls.filter(([p]) => p.event === 'mcp_promo_shown');
    expect(shown).toHaveLength(1);
    expect(shown[0][0]).toMatchObject({ label: 'create_data_mart', context: 'setup' });
  });

  it('renders no card without an MCP server', () => {
    mocks.mcpServerUrl = undefined;
    render(<CreateDataMartPage />);

    expect(screen.queryByText('Set it up with your AI assistant')).not.toBeInTheDocument();
  });

  it('renders nothing around the form without an MCP server', () => {
    mocks.mcpServerUrl = undefined;
    render(<CreateDataMartPage />);

    expect(screen.getByRole('heading', { name: 'Create Data Mart' }).nextElementSibling).toBe(
      screen.getByTestId('create-form')
    );
    expect(screen.getByTestId('create-form').nextElementSibling).toBeNull();
  });

  it('renders nothing around the form for a viewer', () => {
    mocks.canEdit = false;
    render(<CreateDataMartPage />);

    expect(screen.getByRole('heading', { name: 'Create Data Mart' }).nextElementSibling).toBe(
      screen.getByTestId('create-form')
    );
    expect(screen.getByTestId('create-form').nextElementSibling).toBeNull();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it('passes the created id in router state', () => {
    render(<CreateDataMartPage />);
    fireEvent.click(screen.getByText('create'));

    expect(mocks.navigate).toHaveBeenCalledWith('/data-marts/dm-new/data-setup', {
      state: { createdDataMartId: 'dm-new' },
    });
  });
});
