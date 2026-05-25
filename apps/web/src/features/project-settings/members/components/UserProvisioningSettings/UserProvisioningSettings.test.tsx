import { render, screen, waitFor } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
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
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@owox/ui/components/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
    id,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    id?: string;
  }) => (
    <input
      id={id}
      type='checkbox'
      checked={checked}
      disabled={disabled}
      onChange={event => {
        onCheckedChange(event.currentTarget.checked);
      }}
    />
  ),
}));

vi.mock('@owox/ui/components/select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <select
      value={value}
      disabled={disabled}
      onChange={event => {
        onValueChange(event.currentTarget.value);
      }}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

vi.mock('@owox/ui/components/accordion', () => ({
  Accordion: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AccordionItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AccordionTrigger: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AccordionContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@owox/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div role='tooltip'>{children}</div>,
}));

const applicableResponse: UserProvisioningSettingsResponse = {
  isApplicable: true,
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

  it('hides the block and logs when settings loading fails', async () => {
    const error = new Error('Internal Server Error');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockRejectedValueOnce(error);

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    await waitFor(() => {
      expect(projectMembersService.getUserProvisioningSettings).toHaveBeenCalled();
    });
    expect(screen.queryByText('User Provisioning')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('Failed to load user provisioning settings', error);

    consoleError.mockRestore();
  });

  it('does not render the block when backend marks provisioning as not applicable', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce({
      isApplicable: false,
      organization: null,
      settings: null,
    });

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    await waitFor(() => {
      expect(projectMembersService.getUserProvisioningSettings).toHaveBeenCalled();
    });
    expect(screen.queryByText('User Provisioning')).not.toBeInTheDocument();
  });

  it('renders current automatic provisioning defaults for applicable organization-backed projects', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce(
      applicableResponse
    );

    render(<UserProvisioningSettings contexts={[]} isAdmin={true} />);

    expect(await screen.findByText('User Provisioning')).toBeInTheDocument();
    expect(screen.getByLabelText('Automatic user provisioning')).toBeChecked();
    expect(screen.getByDisplayValue('Business User')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Entire Project')).toBeInTheDocument();
    expect(screen.getByText('owox.com')).toBeInTheDocument();
  });

  it('renders settings as read-only for non-admin users', async () => {
    vi.mocked(projectMembersService.getUserProvisioningSettings).mockResolvedValueOnce(
      applicableResponse
    );

    render(<UserProvisioningSettings contexts={[]} isAdmin={false} />);

    expect(await screen.findByText('User Provisioning')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Automatic user provisioning/ })).toBeDisabled();
    for (const select of screen.getAllByRole('combobox')) {
      expect(select).toBeDisabled();
    }
    expect(
      screen.getAllByText('You need the Project Admin role to manage members.').length
    ).toBeGreaterThan(0);
  });
});
