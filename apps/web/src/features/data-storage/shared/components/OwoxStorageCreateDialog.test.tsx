import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OwoxStorageCreateDialog } from './OwoxStorageCreateDialog';

const createOwoxStorage = vi.hoisted(() => vi.fn());
vi.mock('../model/hooks/useDataStorage', () => ({ useDataStorage: () => ({ createOwoxStorage }) }));

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
    fireEvent.click(screen.getByRole('radio', { name: 'EU' }));
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });

  it('creates with the title and location and reports the storage', async () => {
    const storage = { id: 's1' };
    createOwoxStorage.mockResolvedValue(storage);
    const { onCreated, onClose } = setup();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: ' My OWOX ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'US' }));
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
    fireEvent.click(screen.getByRole('radio', { name: 'US' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Project already has an OWOX Storage'
    );
    expect(onCreated).not.toHaveBeenCalled();
  });
});
