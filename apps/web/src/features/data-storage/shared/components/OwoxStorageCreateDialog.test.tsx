import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OwoxStorageCreateDialog } from './OwoxStorageCreateDialog';

const createOwoxStorage = vi.hoisted(() => vi.fn());
vi.mock('../model/hooks/useDataStorage', () => ({ useDataStorage: () => ({ createOwoxStorage }) }));

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
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string }) => <option value={value}>{value}</option>,
}));

const pick = (value: string) => {
  fireEvent.change(screen.getByLabelText('Location'), { target: { value } });
};

const setup = () => {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  render(<OwoxStorageCreateDialog isOpen onClose={onClose} onCreated={onCreated} />);
  return { onCreated, onClose };
};

describe('OwoxStorageCreateDialog', () => {
  beforeEach(() => {
    createOwoxStorage.mockReset();
  });

  it('requires a location', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    pick('EU');
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  it('creates with the title and location and reports the storage', async () => {
    const storage = { id: 's1' };
    createOwoxStorage.mockResolvedValue(storage);
    const { onCreated, onClose } = setup();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' My OWOX ' } });
    pick('US');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith(storage);
    });
    expect(createOwoxStorage).toHaveBeenCalledWith({ title: 'My OWOX', location: 'US' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the server message on failure', async () => {
    createOwoxStorage.mockRejectedValue({
      response: { data: { message: 'Project already has an OWOX Storage' } },
    });
    const { onCreated } = setup();
    pick('US');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Project already has an OWOX Storage'
    );
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('starts empty when reopened after Cancel', () => {
    const onClose = vi.fn();
    const props = { onClose, onCreated: vi.fn() };
    const { rerender } = render(<OwoxStorageCreateDialog isOpen {...props} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Changed' } });
    pick('EU');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    rerender(<OwoxStorageCreateDialog isOpen={false} {...props} />);
    rerender(<OwoxStorageCreateDialog isOpen {...props} />);
    expect(screen.getByLabelText('Title')).toHaveValue('OWOX Storage');
    expect(screen.getByLabelText('Location')).toHaveValue('');
  });

  it('does not show the create error when onCreated rejects', async () => {
    createOwoxStorage.mockResolvedValue({ id: 's1' });
    const onCreated = vi.fn().mockRejectedValue(new Error('boom'));
    const onClose = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<OwoxStorageCreateDialog isOpen onClose={onClose} onCreated={onCreated} />);
    pick('US');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores Escape while a create runs and honours it afterwards', async () => {
    let finish: (storage: unknown) => void = () => undefined;
    createOwoxStorage.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const { onClose } = setup();
    pick('US');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    fireEvent.keyDown(screen.getByTestId('owoxStorageCreateDialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    finish({ id: 's1' });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('closes on Escape when no create runs', () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByTestId('owoxStorageCreateDialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
