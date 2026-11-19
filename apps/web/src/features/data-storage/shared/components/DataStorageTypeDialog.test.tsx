import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStorageTypeDialog } from './DataStorageTypeDialog';

const flags = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock('../../../../app/store/hooks/useFlags', () => ({
  useFlags: () => ({ flags: flags.value, callState: 'success' }),
}));

const renderDialog = (onSelectOwoxStorage?: () => void) =>
  render(
    <DataStorageTypeDialog
      isOpen
      onClose={vi.fn()}
      onSelect={vi.fn()}
      isCreatingDataStorage={false}
      onSelectOwoxStorage={onSelectOwoxStorage}
    />
  );

describe('DataStorageTypeDialog: OWOX Storage', () => {
  beforeEach(() => {
    flags.value = { OWOX_STORAGE_ENABLED: 'true' };
  });

  it('shows OWOX Storage first when the flag is on', () => {
    const onSelect = vi.fn();
    renderDialog(onSelect);
    const buttons = within(screen.getByTestId('storageTypeDialog')).getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('OWOX Storage');
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it.each([
    ['the flag is off', { OWOX_STORAGE_ENABLED: 'false' }, vi.fn()],
    ['the flag is missing', {}, vi.fn()],
    ['no handler is passed', { OWOX_STORAGE_ENABLED: 'true' }, undefined],
  ])('hides it when %s', (_name, value, handler) => {
    flags.value = value;
    renderDialog(handler);
    expect(screen.queryByText('OWOX Storage')).not.toBeInTheDocument();
  });
});
