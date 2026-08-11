import React, { createContext, useContext } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConnectorsTable } from './ConnectorsTable';
import type { CustomConnectorListItemDto } from '../../../../connector-builder/shared/api/types';
import type { Role, User } from '../../../../idp/types';

// usePermissions reads the signed-in user through useRole -> useUser, and useAuth throws
// without a provider. Driving it by roles (rather than stubbing usePermissions) keeps the
// real admin-or-editor hierarchy under test.
const authUser = vi.hoisted(() => ({ value: null as User | null }));

vi.mock('../../../../idp/hooks/useAuthState', () => ({
  useAuthState: () => ({ isLoading: false }),
  useUser: () => authUser.value,
  useIsAuthenticated: () => authUser.value !== null,
  useAuthActions: () => ({}),
}));

function user(roles: Role[]): User {
  return { id: 'u-1', projectId: 'p-1', roles };
}

// Radix DropdownMenu uses pointer-events that don't work in jsdom.
// We replace it with a thin controlled shim that gates DropdownMenuContent on
// the open prop, matching the open/onOpenChange contract — component behavior unchanged.
const DropdownOpenCtx = createContext(false);

vi.mock('@owox/ui/components/dropdown-menu', () => ({
  DropdownMenu: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (v: boolean) => void;
  }) => (
    <DropdownOpenCtx.Provider value={open}>
      <div
        data-testid='dropdown-menu'
        data-open={open}
        onClick={() => {
          onOpenChange(!open);
        }}
      >
        {children}
      </div>
    </DropdownOpenCtx.Provider>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid='dropdown-trigger'>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => {
    const open = useContext(DropdownOpenCtx);
    return open ? <div data-testid='dropdown-content'>{children}</div> : null;
  },
  // `disabled` is honoured here because Radix swallows the click on a disabled item; a shim
  // that ignored it would let a "viewer cannot delete" assertion pass for the wrong reason.
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    'data-testid': testId,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'data-testid'?: string;
  }) => (
    <div
      role='menuitem'
      data-testid={testId}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

const rows: CustomConnectorListItemDto[] = [
  {
    id: 'c1',
    name: 'acme',
    title: 'Acme',
    description: 'desc',
    logo: null,
    docUrl: null,
    activeVersionId: 'v3',
    activeVersion: 3,
  },
  {
    id: 'c2',
    name: 'draftco',
    title: 'Draft Co',
    description: null,
    logo: null,
    docUrl: null,
    activeVersionId: null,
    activeVersion: null,
  },
];

describe('ConnectorsTable', () => {
  beforeEach(() => {
    authUser.value = user(['editor']);
  });

  it('renders rows with published/draft status', () => {
    render(<ConnectorsTable data={rows} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Published · v3')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('CTA calls onCreate', () => {
    const onCreate = vi.fn();
    render(<ConnectorsTable data={rows} onOpen={vi.fn()} onCreate={onCreate} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'New connector' }));
    expect(onCreate).toHaveBeenCalled();
  });

  it('row click calls onOpen with the id', () => {
    const onOpen = vi.fn();
    render(<ConnectorsTable data={rows} onOpen={onOpen} onCreate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByText('Acme'));
    expect(onOpen).toHaveBeenCalledWith('c1');
  });

  it('delete confirms before calling onDelete', async () => {
    const onDelete = vi.fn();
    render(<ConnectorsTable data={rows} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open menu' })[0]);
    fireEvent.click(await screen.findByTestId('connectorDeleteButton'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });

  it('shows the empty state when there are no rows', () => {
    const onCreate = vi.fn();
    render(<ConnectorsTable data={[]} onOpen={vi.fn()} onCreate={onCreate} onDelete={vi.fn()} />);
    expect(screen.getByText('No custom connectors yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New connector' }));
    expect(onCreate).toHaveBeenCalled();
  });

  // Create, publish, activate and delete are all @Auth(Role.editor()) on the backend, so for a
  // viewer these controls could only ever end in a 403.
  describe('a viewer', () => {
    beforeEach(() => {
      authUser.value = user(['viewer']);
    });

    it('cannot use the CTA to create', () => {
      const onCreate = vi.fn();
      render(
        <ConnectorsTable data={rows} onOpen={vi.fn()} onCreate={onCreate} onDelete={vi.fn()} />
      );
      const cta = screen.getByRole('button', { name: 'New connector' });
      expect(cta).toBeDisabled();
      fireEvent.click(cta);
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('cannot create from the empty state', () => {
      const onCreate = vi.fn();
      render(<ConnectorsTable data={[]} onOpen={vi.fn()} onCreate={onCreate} onDelete={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'New connector' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'New connector' }));
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('cannot delete from the row menu', async () => {
      const onDelete = vi.fn();
      render(
        <ConnectorsTable data={rows} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={onDelete} />
      );
      fireEvent.click(screen.getAllByRole('button', { name: 'Open menu' })[0]);
      const item = await screen.findByTestId('connectorDeleteButton');
      expect(item).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);
      // No confirmation dialog opens, so nothing can reach onDelete.
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('can still open a connector, which explains the missing access on the route', () => {
      const onOpen = vi.fn();
      render(<ConnectorsTable data={rows} onOpen={onOpen} onCreate={vi.fn()} onDelete={vi.fn()} />);
      fireEvent.click(screen.getByText('Acme'));
      expect(onOpen).toHaveBeenCalledWith('c1');
    });
  });

  // The backend maps `editor` to ['editor', 'admin'], and an admin may make every write here.
  it('lets an admin create and delete', async () => {
    authUser.value = user(['admin']);
    const onDelete = vi.fn();
    render(<ConnectorsTable data={rows} onOpen={vi.fn()} onCreate={vi.fn()} onDelete={onDelete} />);
    expect(screen.getByRole('button', { name: 'New connector' })).toBeEnabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Open menu' })[0]);
    fireEvent.click(await screen.findByTestId('connectorDeleteButton'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });
});
