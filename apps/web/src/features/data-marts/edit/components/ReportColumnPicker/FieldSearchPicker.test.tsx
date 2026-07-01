import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FieldSearchPicker } from './FieldSearchPicker';

// Radix Popover/Tooltip portals + cmdk Command manage their own state/portals.
// Mock them to passthroughs so RTL can see the items and click them directly.
vi.mock('@owox/ui/components/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@owox/ui/components/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

vi.mock('@owox/ui/components/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => <input placeholder={placeholder} />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <div
      role='option'
      onClick={() => {
        onSelect?.();
      }}
    >
      {children}
    </div>
  ),
}));

describe('FieldSearchPicker', () => {
  it('hands back the raw value, not the label, when an item is chosen', () => {
    const onSelect = vi.fn();
    render(
      <FieldSearchPicker
        items={[
          {
            value: 'orders.product_revenue',
            label: 'Product Revenue',
            dataMartName: 'Orders',
            path: ['orders', 'product_revenue'],
          },
        ]}
        placeholder='Add filter'
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByText('Product Revenue'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('orders.product_revenue');
  });

  it('shows the joined data mart name as a second line', () => {
    render(
      <FieldSearchPicker
        items={[
          {
            value: 'blended_users__email',
            label: 'email',
            dataMartName: 'Users',
            path: ['orders', 'users', 'email'],
          },
        ]}
        placeholder='Add filter'
        onSelect={() => {}}
      />
    );

    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });
});
