import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataStorageType } from '../../../shared';
import { DataStorageForm } from './DataStorageForm';

vi.mock('../../../../../app/store/hooks', () => ({ useFlags: () => ({ flags: {} }) }));
vi.mock('../../../../idp/hooks/useAuthState', () => ({
  useUser: () => ({ id: 'user-1', fullName: 'Admin', email: 'admin@example.com', avatar: null }),
}));
vi.mock('../../../../idp/hooks/useRole', () => ({ useIsAdmin: () => false }));
vi.mock('../../../../../features/contexts/hooks/useInlineContextCreate', () => ({
  useInlineContextCreate: () => ({ pickerProps: {}, sheetProps: {} }),
}));
vi.mock('../../../../../features/contexts/components/AddContextSheet/AddContextSheet', () => ({
  AddContextSheet: () => null,
}));

// Radix Select renders its items in a portal only while open; a native <select> keeps the test on behavior.
vi.mock('@owox/ui/components/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      aria-label='Location'
      value={value}
      onChange={e => {
        onValueChange(e.target.value);
      }}
    >
      <option value=''>Select location</option>
      {children}
    </select>
  ),
  SelectGroup: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string }) => <option value={value}>{value}</option>,
}));

const renderNew = () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<DataStorageForm newOwoxStorage onSubmit={onSubmit} onCancel={vi.fn()} />);
  return onSubmit;
};

describe('DataStorageForm — new OWOX Storage', () => {
  it('asks for a location and shows no Google Cloud settings', () => {
    renderNew();

    expect(screen.getByPlaceholderText('Storage title')).toHaveValue('OWOX Storage');
    expect(screen.getByRole('combobox', { name: 'Location' })).toHaveValue('');
    expect(screen.getByText('The location cannot be changed later.')).toBeInTheDocument();
    expect(screen.queryByText('Project ID')).toBeNull();
    expect(screen.queryByText('Credential')).toBeNull();
    expect(screen.queryByText('How do I enable the BigQuery API?')).toBeNull();
  });

  it('saves the title and the selected location', async () => {
    const onSubmit = renderNew();

    fireEvent.change(screen.getByRole('combobox', { name: 'Location' }), {
      target: { value: 'EU' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      type: DataStorageType.GOOGLE_BIGQUERY,
      title: 'OWOX Storage',
      config: { location: 'EU' },
    });
  });

  it('does not save without a location', async () => {
    const onSubmit = renderNew();

    fireEvent.change(screen.getByPlaceholderText('Storage title'), { target: { value: 'Ads' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Location is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
