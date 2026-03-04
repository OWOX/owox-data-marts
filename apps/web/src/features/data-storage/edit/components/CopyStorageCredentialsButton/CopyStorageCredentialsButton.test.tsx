import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { CredentialIdentity } from '../../../../../shared/types/credential-identity';
import { CopyStorageCredentialsButton } from './CopyStorageCredentialsButton';
import { dataStorageApiService } from '../../../shared/api';
import { DataStorageType } from '../../../shared';

vi.mock('../../../shared/api', () => ({
  dataStorageApiService: {
    getDataStoragesByType: vi.fn(),
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

const mockGetDataStoragesByType = vi.mocked(dataStorageApiService.getDataStoragesByType);

const mockItems: {
  id: string;
  title: string;
  dataMartName: string;
  identity: CredentialIdentity;
}[] = [
  {
    id: 'storage-1',
    title: 'Storage 1',
    dataMartName: 'Marketing Analytics',
    identity: { clientEmail: 'sa@project.iam' },
  },
  {
    id: 'storage-2',
    title: 'Storage 2',
    dataMartName: 'Sales Dashboard',
    identity: { email: 'user@domain.com' },
  },
];

describe('CopyStorageCredentialsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // STUI-05: Button hidden when API returns empty array
  it('STUI-05: does not render button when API returns empty array', async () => {
    mockGetDataStoragesByType.mockResolvedValue([]);

    render(
      <CopyStorageCredentialsButton
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockGetDataStoragesByType).toHaveBeenCalledWith(DataStorageType.GOOGLE_BIGQUERY);
    });

    expect(screen.queryByRole('button')).toBeNull();
  });

  // STUI-05: Button hidden while initial load is pending
  it('STUI-05: does not render button while initial load is pending', () => {
    // Never-resolving promise — button should remain hidden
    mockGetDataStoragesByType.mockReturnValue(new Promise(() => undefined));

    render(
      <CopyStorageCredentialsButton
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        onSelect={vi.fn()}
      />
    );

    // Should not render anything immediately (hasAvailableStorages is null)
    expect(screen.queryByRole('button')).toBeNull();
  });

  // STUI-01/STUI-02: Button visible when API returns items
  it('STUI-01/STUI-02: renders button when API returns available storages', async () => {
    mockGetDataStoragesByType.mockResolvedValue(mockItems);

    render(
      <CopyStorageCredentialsButton
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    expect(screen.getByText(/copy from/i)).toBeInTheDocument();
  });

  // STUI-03/STUI-04: Dropdown lists same-type Storages with title
  it('STUI-03/STUI-04: dropdown shows title for each same-type storage', async () => {
    mockGetDataStoragesByType.mockResolvedValue(mockItems);

    render(
      <CopyStorageCredentialsButton
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    // Click the trigger button to open dropdown
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Storage 1')).toBeInTheDocument();
      expect(screen.getByText('Storage 2')).toBeInTheDocument();
      expect(screen.getByText('Service Account')).toBeInTheDocument();
      expect(screen.getByText('OAuth')).toBeInTheDocument();
    });
  });

  // Self-exclusion: currentStorageId filtered out
  it('filters out current storage from dropdown items', async () => {
    mockGetDataStoragesByType.mockResolvedValue(mockItems);

    render(
      <CopyStorageCredentialsButton
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        currentStorageId='storage-1'
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.queryByText('Storage 1')).toBeNull();
      expect(screen.getByText('Storage 2')).toBeInTheDocument();
    });
  });

  // STUI-05 edge case: Button hidden when all items are excluded by self-filter
  it('STUI-05: does not render button when all items are filtered out by currentStorageId', async () => {
    const singleItem = [
      {
        id: 'storage-1',
        title: 'Storage 1',
        dataMartName: 'Marketing Analytics',
        identity: { clientEmail: 'sa@project.iam' },
      },
    ];
    mockGetDataStoragesByType.mockResolvedValue(singleItem);

    render(
      <CopyStorageCredentialsButton
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        currentStorageId='storage-1'
        onSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockGetDataStoragesByType).toHaveBeenCalled();
    });

    // All items filtered out — button should not render
    expect(screen.queryByRole('button')).toBeNull();
  });

  // onSelect callback fires with correct args
  it('calls onSelect with correct storageId and title when item is clicked', async () => {
    mockGetDataStoragesByType.mockResolvedValue(mockItems);
    const onSelect = vi.fn();

    render(
      <CopyStorageCredentialsButton
        storageType={DataStorageType.GOOGLE_BIGQUERY}
        onSelect={onSelect}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    // Open dropdown
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Storage 1')).toBeInTheDocument();
    });

    // Click first dropdown item
    const items = screen.getAllByTestId('dropdown-item');
    const marketingItem = items.find(el => el.textContent.includes('Storage 1'));
    expect(marketingItem).toBeDefined();
    fireEvent.click(marketingItem!);

    expect(onSelect).toHaveBeenCalledWith('storage-1', 'Storage 1', {
      clientEmail: 'sa@project.iam',
    });
  });
});
