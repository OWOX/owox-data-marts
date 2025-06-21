import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SortableHeader } from './SortableHeader';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@owox/ui/components/button', () => ({
  Button: ({ children, variant, onClick, className }: any) => (
    <button
      onClick={onClick}
      className={`${className} button-variant-${variant}`}
      data-variant={variant}
      data-testid='sort-button'
    >
      {children}
    </button>
  ),
}));

describe('SortableHeader', () => {
  const mockColumn = {
    getIsSorted: vi.fn(),
    toggleSorting: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders children correctly', () => {
    render(
      <SortableHeader column={mockColumn as any}>
        <span data-testid='header-content'>Test Header</span>
      </SortableHeader>
    );

    expect(screen.getByTestId('header-content')).toBeInTheDocument();
    expect(screen.getByText('Test Header')).toBeInTheDocument();
  });

  it('renders the ArrowUpDown icon with correct opacity class when not sorted', () => {
    mockColumn.getIsSorted.mockReturnValue(false);

    render(<SortableHeader column={mockColumn as any}>Test Header</SortableHeader>);

    const icon = screen.getByTestId('lucide-arrow-up-down');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('opacity-0');
    expect(icon).toHaveClass('group-hover/header:opacity-70');
  });

  it('renders the ArrowUpDown icon with full opacity when sorted', () => {
    mockColumn.getIsSorted.mockReturnValue('asc');

    render(<SortableHeader column={mockColumn as any}>Test Header</SortableHeader>);

    const icon = screen.getByTestId('lucide-arrow-up-down');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('opacity-100');
    expect(icon).not.toHaveClass('opacity-0');
  });

  it('calls toggleSorting with correct parameter when clicked', () => {
    mockColumn.getIsSorted.mockReturnValue('asc');

    const { unmount } = render(
      <SortableHeader column={mockColumn as any}>Test Header</SortableHeader>
    );

    fireEvent.click(screen.getByTestId('sort-button'));

    expect(mockColumn.toggleSorting).toHaveBeenCalledTimes(1);
    expect(mockColumn.toggleSorting).toHaveBeenCalledWith(true);

    unmount();
    vi.clearAllMocks();
    mockColumn.getIsSorted.mockReturnValue('desc');

    render(<SortableHeader column={mockColumn as any}>Test Header</SortableHeader>);

    fireEvent.click(screen.getByRole('button'));

    expect(mockColumn.toggleSorting).toHaveBeenCalledTimes(1);
    expect(mockColumn.toggleSorting).toHaveBeenCalledWith(false);
  });

  it('has the correct button styling', () => {
    render(<SortableHeader column={mockColumn as any}>Test Header</SortableHeader>);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('px-4');
    expect(button).toHaveClass('hover:bg-gray-200');
    expect(button).toHaveAttribute('data-variant', 'ghost');
    expect(button).toHaveClass('button-variant-ghost');
  });
});
