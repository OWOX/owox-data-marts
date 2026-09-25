import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataMartIconPicker } from './DataMartIconPicker';
import { DATA_MART_ICON_OPTIONS, DEFAULT_DATA_MART_ICON, getDataMartIcon } from './data-mart-icons';
import { DATA_MART_ICON_KEYS } from '../../enums/data-mart-icon.enum';

describe('getDataMartIcon', () => {
  it('maps a known key to its icon and anything else to the default one', () => {
    expect(getDataMartIcon('purchases')).toBe(DATA_MART_ICON_OPTIONS[0].icon);
    expect(getDataMartIcon(null)).toBe(DEFAULT_DATA_MART_ICON);
    expect(getDataMartIcon('rocket')).toBe(DEFAULT_DATA_MART_ICON);
  });

  it('keeps every key unique', () => {
    const keys = DATA_MART_ICON_OPTIONS.map(option => option.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every key its own glyph', () => {
    expect(new Set(DATA_MART_ICON_OPTIONS.map(option => option.icon)).size).toBe(
      DATA_MART_ICON_OPTIONS.length
    );
  });

  it('draws every key the API accepts, and nothing else', () => {
    expect([...DATA_MART_ICON_OPTIONS.map(option => option.key)].sort()).toEqual(
      [...DATA_MART_ICON_KEYS].sort()
    );
  });
});

describe('DataMartIconPicker', () => {
  const open = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Change Data Mart icon' }));
  };

  it('saves the picked icon and marks the current one as selected', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<DataMartIconPicker icon='sessions' onChange={onChange} />);

    open();
    expect(screen.getByRole('button', { name: 'Sessions' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Purchases' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('purchases');
    });
  });

  it('lists every icon in one grid, in registry order', () => {
    render(<DataMartIconPicker icon={null} onChange={vi.fn()} />);

    open();

    const iconButtons = within(screen.getByRole('group', { name: 'Data Mart icons' })).getAllByRole(
      'button'
    );
    expect(iconButtons.map(button => button.getAttribute('aria-label'))).toEqual(
      DATA_MART_ICON_OPTIONS.map(option => option.label)
    );
  });

  it('does not save when the current icon is picked again', () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<DataMartIconPicker icon='sessions' onChange={onChange} />);

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('resets to the default icon, and offers no reset when nothing is picked', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<DataMartIconPicker icon={null} onChange={onChange} />);

    open();
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();

    rerender(<DataMartIconPicker icon='orders' onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });
});
