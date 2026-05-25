import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MembershipRequestSheet } from '../MembershipRequestSheet';
import {
  MembersSettingsReactContext,
  type MembersSettingsStoreValue,
} from '../../../model/members-settings.context';
import { projectMembersService } from '../../../../../project-members/services/project-members.service';
import type { MembershipRequestDto } from '../../../../../project-members/types';

// Mock the service
vi.mock('../../../../../project-members/services/project-members.service', () => ({
  projectMembersService: {
    approveMembershipRequest: vi.fn(),
    declineMembershipRequest: vi.fn(),
  },
}));

// Mock Sheet components to avoid Radix UI portal issues in happy-dom
vi.mock('@owox/ui/components/sheet', () => ({
  Sheet: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <div data-testid='sheet'>{children}</div> : null),
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sheet-content'>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='sheet-header'>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

// Mock ConfirmationDialog to avoid Radix Dialog portal issues
vi.mock('../../../../../../shared/components/ConfirmationDialog', () => ({
  ConfirmationDialog: ({
    open,
    title,
    onConfirm,
    onOpenChange,
    confirmLabel = 'Confirm',
    cancelLabel,
  }: {
    open: boolean;
    title: string;
    description?: React.ReactNode;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: string;
  }) =>
    open ? (
      <div data-testid='confirmation-dialog'>
        <p>{title}</p>
        {cancelLabel && (
          <button
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {cancelLabel}
          </button>
        )}
        <button
          onClick={() => {
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    ) : null,
}));

// Mock MemberFormFields to avoid deep dependency chain (useIsAdmin → useUser → useAuth)
vi.mock('../../MemberFormFields/MemberFormFields', () => ({
  MemberFormFields: () => <div data-testid='member-form-fields' />,
}));

// Mock AddContextSheet to avoid its own dependency chain
vi.mock('../../../../../contexts/components/AddContextSheet/AddContextSheet', () => ({
  AddContextSheet: () => null,
}));

// Mock form UI components used directly in the sheet header
vi.mock('@owox/ui/components/form', () => ({
  AppForm: ({
    children,
    onSubmit,
  }: {
    children: React.ReactNode;
    onSubmit?: React.ComponentProps<'form'>['onSubmit'];
  }) => <form onSubmit={onSubmit}>{children}</form>,
  Form: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  FormActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: () => null,
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormMessage: () => null,
  FormDescription: () => null,
}));

// Mock Button to render a real HTML button
vi.mock('@owox/ui/components/button', () => ({
  Button: ({
    children,
    onClick,
    type = 'button',
    disabled,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button type={type} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

// Mock toast to avoid side effects
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const request: MembershipRequestDto = {
  requestId: 'req-1',
  email: 'alice@example.com',
  fullName: 'Alice Example',
  requestedRole: 'editor',
  createdAt: '2026-05-01T10:00:00Z',
};

const store = (overrides: Partial<MembersSettingsStoreValue> = {}): MembersSettingsStoreValue => ({
  contexts: [],
  members: [],
  pendingRequests: [request],
  loading: false,
  loadingRequests: false,
  hasLoadError: false,
  refresh: vi.fn().mockResolvedValue(undefined),
  optimisticRemoveMember: vi.fn(),
  optimisticRemoveRequest: vi.fn(),
  isAdmin: true,
  openInviteSheet: vi.fn(),
  openAddContextSheet: vi.fn(),
  openMembershipRequestSheet: vi.fn(),
  ...overrides,
});

function renderSheet(props: Partial<React.ComponentProps<typeof MembershipRequestSheet>> = {}) {
  const onClose = vi.fn();
  const onResolved = vi.fn();
  const optimisticRemoveRequest = vi.fn();
  const utils = render(
    <MembersSettingsReactContext.Provider value={store({ optimisticRemoveRequest })}>
      <MembershipRequestSheet
        isOpen={true}
        request={request}
        contexts={[]}
        onClose={onClose}
        onResolved={onResolved}
        {...props}
      />
    </MembersSettingsReactContext.Provider>
  );
  return { ...utils, onClose, onResolved, optimisticRemoveRequest };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MembershipRequestSheet', () => {
  it('renders the requester identity block with name, email, and requested date', () => {
    renderSheet();
    // Generic, identity-free title (no email/role in the header).
    expect(screen.getByText(/Membership request/i)).toBeInTheDocument();
    // Identity block in the body shows the full name and email.
    expect(screen.getByText('Alice Example')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    // Requested date is a separate FormItem (label + value).
    // Fixture is '2026-05-01T10:00:00Z'. Matching the year only keeps the
    // assertion safe across browser timezones (formatDateShort is locale/TZ).
    expect(screen.getByText(/Requested date/i)).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('approve fires service.approveMembershipRequest with role + scope', async () => {
    const { onResolved, optimisticRemoveRequest } = renderSheet();
    (
      projectMembersService.approveMembershipRequest as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      userId: 'u-1',
      role: 'editor',
      roleScope: 'entire_project',
      contextIds: [],
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Approve request/i }));
    });
    await waitFor(() => {
      expect(projectMembersService.approveMembershipRequest).toHaveBeenCalledWith('req-1', {
        role: 'editor',
        roleScope: 'entire_project',
        contextIds: undefined,
      });
    });
    expect(optimisticRemoveRequest).toHaveBeenCalledWith('req-1');
    expect(onResolved).toHaveBeenCalledWith(true);
  });

  it('approve with admin role omits roleScope from the payload', async () => {
    const adminRequest: MembershipRequestDto = {
      ...request,
      requestId: 'req-adm',
      requestedRole: 'admin',
    };
    const onResolved = vi.fn();
    const optimisticRemoveRequest = vi.fn();
    render(
      <MembersSettingsReactContext.Provider value={store({ optimisticRemoveRequest })}>
        <MembershipRequestSheet
          isOpen={true}
          request={adminRequest}
          contexts={[]}
          onClose={vi.fn()}
          onResolved={onResolved}
        />
      </MembersSettingsReactContext.Provider>
    );
    (
      projectMembersService.approveMembershipRequest as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      userId: 'u-adm',
      role: 'admin',
      roleScope: 'entire_project',
      contextIds: [],
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Approve request/i }));
    });
    await waitFor(() => {
      expect(projectMembersService.approveMembershipRequest).toHaveBeenCalledWith('req-adm', {
        role: 'admin',
        roleScope: undefined,
        contextIds: undefined,
      });
    });
  });

  it('decline opens the confirmation dialog; confirming fires service.declineMembershipRequest', async () => {
    const { onResolved, optimisticRemoveRequest } = renderSheet();
    (
      projectMembersService.declineMembershipRequest as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(undefined);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Decline request/i }));
    });
    expect(screen.getByText(/Decline membership request/i)).toBeInTheDocument();
    // The confirmation dialog uses 'Decline' as confirm label
    const confirmButtons = screen.getAllByRole('button', { name: /^Decline$/i });
    act(() => {
      fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    });
    await waitFor(() => {
      expect(projectMembersService.declineMembershipRequest).toHaveBeenCalledWith('req-1');
    });
    expect(optimisticRemoveRequest).toHaveBeenCalledWith('req-1');
    expect(onResolved).toHaveBeenCalledWith(true);
  });

  it('approve error shows toast and keeps sheet open (no onResolved call)', async () => {
    const { onResolved, optimisticRemoveRequest } = renderSheet();
    (
      projectMembersService.approveMembershipRequest as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Server exploded'));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Approve request/i }));
    });
    await waitFor(() => {
      expect(projectMembersService.approveMembershipRequest).toHaveBeenCalled();
    });
    expect(optimisticRemoveRequest).not.toHaveBeenCalled();
    expect(onResolved).not.toHaveBeenCalled();
  });
});
