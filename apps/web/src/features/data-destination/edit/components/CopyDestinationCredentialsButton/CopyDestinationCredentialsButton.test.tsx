import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { CredentialIdentity } from '../../../../../shared/types/credential-identity';
import { CopyDestinationCredentialsButton } from './CopyDestinationCredentialsButton';
import { dataDestinationService } from '../../../shared/services';
import { DataDestinationType } from '../../../shared';

vi.mock('../../../shared/services', () => ({
  dataDestinationService: {
    getDataDestinationsByType: vi.fn(),
  },
}));

// Mock UI components to avoid Radix UI pointer-events issues in happy-dom
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
    <div
      data-testid='dropdown-menu'
      data-open={open}
      onClick={() => {
        onOpenChange(!open);
      }}
    >
      {children}
    </div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='dropdown-trigger'>{children}</div>
  ),
  DropdownMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
    side?: string;
    align?: string;
    className?: string;
  }) => <div data-testid='dropdown-content'>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <div
      data-testid='dropdown-item'
      data-disabled={disabled}
      onClick={() => {
        if (!disabled && onSelect) onSelect();
      }}
    >
      {children}
    </div>
  ),
}));

vi.mock('@owox/ui/components/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='tooltip-content'>{children}</div>
  ),
}));

vi.mock('@owox/ui/components/button', () => ({
  Button: ({
    children,
    onClick,
    type,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: string;
    [key: string]: unknown;
  }) => (
    <button type={type as 'button' | 'submit' | 'reset'} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

const mockGetDataDestinationsByType = vi.mocked(dataDestinationService.getDataDestinationsByType);

const mockItems: {
  id: string;
  title: string;
  dataMartName: string;
  identity: CredentialIdentity;
}[] = [
  {
    id: 'destination-1',
    title: 'Destination 1',
    dataMartName: 'Marketing Analytics',
    identity: { clientEmail: 'sa@project.iam' },
  },
  {
    id: 'destination-2',
    title: 'Destination 2',
    dataMartName: 'Sales Dashboard',
    identity: { email: 'user@domain.com' },
  },
];

describe('CopyDestinationCredentialsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Does not render button when API returns empty array', async () => {
    mockGetDataDestinationsByType.mockResolvedValue([]);

    render(
      <CopyDestinationCredentialsButton
        destinationType={DataDestinationType.GOOGLE_SHEETS}
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockGetDataDestinationsByType).toHaveBeenCalledWith(DataDestinationType.GOOGLE_SHEETS);
    });

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Does not render button while initial load is pending', () => {
    mockGetDataDestinationsByType.mockReturnValue(new Promise(() => undefined));

    render(
      <CopyDestinationCredentialsButton
        destinationType={DataDestinationType.GOOGLE_SHEETS}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Renders button when API returns available destinations', async () => {
    mockGetDataDestinationsByType.mockResolvedValue(mockItems);

    render(
      <CopyDestinationCredentialsButton
        destinationType={DataDestinationType.GOOGLE_SHEETS}
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    expect(screen.getByText(/copy from/i)).toBeInTheDocument();
  });

  it('Dropdown shows title for each same-type destination', async () => {
    mockGetDataDestinationsByType.mockResolvedValue(mockItems);

    render(
      <CopyDestinationCredentialsButton
        destinationType={DataDestinationType.GOOGLE_SHEETS}
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Destination 1')).toBeInTheDocument();
      expect(screen.getByText('Destination 2')).toBeInTheDocument();
      expect(screen.getByText('Service Account')).toBeInTheDocument();
      expect(screen.getByText('OAuth')).toBeInTheDocument();
    });
  });

  it('Filters out current destination from dropdown items', async () => {
    mockGetDataDestinationsByType.mockResolvedValue(mockItems);

    render(
      <CopyDestinationCredentialsButton
        destinationType={DataDestinationType.GOOGLE_SHEETS}
        currentDestinationId='destination-1'
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.queryByText('Destination 1')).toBeNull();
      expect(screen.getByText('Destination 2')).toBeInTheDocument();
    });
  });

  it('Does not render button when all items are filtered out by currentDestinationId', async () => {
    const singleItem = [
      {
        id: 'destination-1',
        title: 'Destination 1',
        dataMartName: 'Marketing Analytics',
        identity: { clientEmail: 'sa@project.iam' },
      },
    ];
    mockGetDataDestinationsByType.mockResolvedValue(singleItem);

    render(
      <CopyDestinationCredentialsButton
        destinationType={DataDestinationType.GOOGLE_SHEETS}
        currentDestinationId='destination-1'
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockGetDataDestinationsByType).toHaveBeenCalled();
    });

    // All items filtered out — button should not render
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onSelect with correct destinationId and title when item is clicked', async () => {
    mockGetDataDestinationsByType.mockResolvedValue(mockItems);
    const onSelect = vi.fn();

    render(
      <CopyDestinationCredentialsButton
        destinationType={DataDestinationType.GOOGLE_SHEETS}
        onSelect={onSelect}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Destination 1')).toBeInTheDocument();
    });

    const items = screen.getAllByTestId('dropdown-item');
    const marketingItem = items.find(el => el.textContent.includes('Destination 1'));
    expect(marketingItem).toBeDefined();
    fireEvent.click(marketingItem!);

    expect(onSelect).toHaveBeenCalledWith('destination-1', 'Destination 1', { clientEmail: 'sa@project.iam' });
  });
});
