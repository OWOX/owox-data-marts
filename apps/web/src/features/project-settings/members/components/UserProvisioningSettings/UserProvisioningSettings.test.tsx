import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserProvisioningSettings } from './UserProvisioningSettings';
import { projectMembersService } from '../../../../project-members/services/project-members.service';
import type { UserProvisioningSettingsResponse } from '../../../../project-members/types';

vi.mock('../../../../project-members/services/project-members.service', () => ({
  projectMembersService: {
    getUserProvisioningSettings: vi.fn(),
    updateUserProvisioningSettings: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@owox/ui/components/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    'data-testid': dataTestId,
  }: {
    children: ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
    'data-testid'?: string;
  }) => (
    <button type={type ?? 'button'} onClick={onClick} disabled={disabled} data-testid={dataTestId}>
      {children}
    </button>
  ),
}));

vi.mock('@owox/ui/components/form', () => ({
  FormRadioCardGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  FormRadioCard: ({
    value,
    label,
    description,
    checked,
    onChange,
    disabled,
    children,
    'data-testid': dataTestId,
  }: {
    value: string;
    label: string;
    description?: string;
    checked: boolean;
    onChange: (value: string) => void;
    disabled?: boolean;
    children?: ReactNode;
    'data-testid'?: string;
  }) => (
    <label>
      <input
        type='radio'
        value={value}
        checked={checked}
        disabled={disabled}
        data-testid={dataTestId}
        onChange={() => {
          onChange(value);
        }}
      />
      <span>{label}</span>
      {description && <span>{description}</span>}
      {children}
    </label>
  ),
}));

vi.mock('@owox/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role='tooltip'>{children}</div>,
}));

vi.mock('./DefaultRoleSheet', () => ({
  DefaultRoleSheet: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onApply: unknown;
    contexts: unknown;
    defaultRole: string;
    roleScope: string;
    contextIds: string[];
    disabled?: boolean;
  }) =>
    isOpen ? (
      <div data-testid='default-role-sheet'>
        <h2>Default user roles</h2>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

const applicableResponse: UserProvisioningSettingsResponse = {
  isApplicable: true,
  isMainProject: true,
  organization: {
    name: 'owox.com',
    mainProjectId: 'main-project',
    mainProjectTitle: 'Main Project',
  },
  settings: {
    mode: 'automatic',
    defaultRole: 'viewer',
    roleScope: 'entire_project',
    contextIds: [],
  },
};

describe('UserProvisioningSettings', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('hides the block when settings loading fails', async () => {
    const error = new Error('Internal Server Error');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockRejectedValueOnce(error);

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    await waitFor(() => {
      expect(projectMembersService.getUserProvisioningSettings).toHaveBeenCalled();
    });
    expect(screen.queryByText('Organization-level access settings')).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Failed to load user provisioning settings', error);

    consoleError.mockRestore();
  });

  it('does not render when backend marks provisioning as not applicable', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce({
      isApplicable: false,
      isMainProject: false,
      organization: null,
      settings: null,
    });

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    await waitFor(() => {
      expect(projectMembersService.getUserProvisioningSettings).toHaveBeenCalled();
    });
    expect(screen.queryByText('Organization-level access settings')).not.toBeInTheDocument();
  });

  it('renders a read-only project-level access notice for non-main organization projects', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce({
      ...applicableResponse,
      isMainProject: false,
    });

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    expect(await screen.findByText('Project-level access')).toBeInTheDocument();
    expect(screen.getByText('Manual access request')).toBeInTheDocument();
    expect(
      screen.getByText(/To manage automatic provisioning for the owox.com organization/)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Main Project' })).toHaveAttribute(
      'href',
      '/ui/main-project/project-settings/members'
    );
    expect(screen.queryByTestId('radio-auto-join')).not.toBeInTheDocument();
  });

  it('does not render when organization is missing', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce({
      ...applicableResponse,
      isMainProject: false,
      organization: null,
    });

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    await waitFor(() => {
      expect(projectMembersService.getUserProvisioningSettings).toHaveBeenCalled();
    });
    expect(screen.queryByText('Project-level access')).not.toBeInTheDocument();
    expect(screen.queryByText('Organization-level access settings')).not.toBeInTheDocument();
  });

  it('does not render for non-admin users', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce(
      applicableResponse
    );

    render(<UserProvisioningSettings contexts={[]} isAdmin={false} />);

    await waitFor(() => {
      expect(projectMembersService.getUserProvisioningSettings).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('radio-auto-join')).not.toBeInTheDocument();
  });

  it('renders two radio cards for automatic/manual mode', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce(
      applicableResponse
    );

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    expect(await screen.findByTestId('radio-auto-join')).toBeInTheDocument();
    expect(screen.getByTestId('radio-require-request')).toBeInTheDocument();
    expect(screen.getByTestId('radio-auto-join')).toBeChecked();
    expect(screen.getByTestId('radio-require-request')).not.toBeChecked();
  });

  it('shows role/scope button when automatic mode is selected', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce(
      applicableResponse
    );

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    await screen.findByTestId('radio-auto-join');
    expect(screen.getByTestId('change-default-roles-btn')).toBeInTheDocument();
  });

  it('hides role/scope button when manual mode is selected', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce({
      ...applicableResponse,
      settings: { ...applicableResponse.settings!, mode: 'manual' },
    });

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    const manualModeRadio = await screen.findByTestId('radio-require-request');
    await waitFor(() => {
      expect(manualModeRadio).toBeChecked();
    });
    expect(screen.queryByTestId('change-default-roles-btn')).not.toBeInTheDocument();
  });

  it('opens DefaultRoleSheet when role/scope button is clicked', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce(
      applicableResponse
    );

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    await screen.findByTestId('radio-auto-join');
    expect(screen.queryByTestId('default-role-sheet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('change-default-roles-btn'));

    expect(screen.getByTestId('default-role-sheet')).toBeInTheDocument();
    expect(screen.getByText('Default user roles')).toBeInTheDocument();
  });

  it('closes DefaultRoleSheet when Cancel is clicked', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce(
      applicableResponse
    );

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    await screen.findByTestId('radio-auto-join');
    fireEvent.click(screen.getByTestId('change-default-roles-btn'));
    expect(screen.getByTestId('default-role-sheet')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('default-role-sheet')).not.toBeInTheDocument();
  });

  it('switches mode to manual when "Manual access request" radio is clicked', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce(
      applicableResponse
    );

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    await screen.findByTestId('radio-auto-join');
    fireEvent.click(screen.getByTestId('radio-require-request'));

    expect(screen.getByTestId('radio-require-request')).toBeChecked();
    expect(screen.queryByTestId('change-default-roles-btn')).not.toBeInTheDocument();
  });
});
