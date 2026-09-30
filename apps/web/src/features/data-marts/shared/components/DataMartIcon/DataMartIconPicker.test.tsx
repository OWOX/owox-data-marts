import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DataMartIconPicker } from './DataMartIconPicker';
import { DATA_MART_ICON_OPTIONS, DEFAULT_DATA_MART_ICON, getDataMartIcon } from './data-mart-icons';
import { DATA_MART_ICON_KEYS } from '../../enums/data-mart-icon.enum';
import { DataMartIconGlyph } from './DataMartIconGlyph';
import { getLucideIcon, LUCIDE_ICON_OPTIONS } from './lucide-icon-catalog';
import { RECOMMENDED_ICON_OPTIONS, searchIconOptions } from './data-mart-icon-search';

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

describe('lucide icon catalogue', () => {
  it('gives every library icon a unique value the API accepts', () => {
    const values = LUCIDE_ICON_OPTIONS.map(option => option.value);
    expect(values.length).toBeGreaterThan(1000);
    expect(new Set(values).size).toBe(values.length);
    // Mirrors the backend's DATA_MART_ICON_PATTERN and the 64-character column.
    for (const value of values) {
      expect(value).toMatch(/^lucide:[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(value.length).toBeLessThanOrEqual(64);
    }
  });

  it('names icons the way lucide does', () => {
    expect(getLucideIcon('lucide:shopping-cart')).toBe(DATA_MART_ICON_OPTIONS[0].icon);
    expect(LUCIDE_ICON_OPTIONS.find(option => option.value === 'lucide:shopping-cart')?.label).toBe(
      'Shopping cart'
    );
    expect(getLucideIcon('lucide:no-such-icon')).toBeUndefined();
  });
});

describe('searchIconOptions', () => {
  it('finds a recommended icon by its glyph name and puts it before library icons', () => {
    const results = searchIconOptions('cart', RECOMMENDED_ICON_OPTIONS, LUCIDE_ICON_OPTIONS);
    expect(results[0].value).toBe('purchases');
    expect(results.map(option => option.value)).toContain('lucide:shopping-cart');
  });

  it('matches every word of the query and lists names that start with it first', () => {
    const results = searchIconOptions('arrow up', [], LUCIDE_ICON_OPTIONS);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].searchText.startsWith('arrow up')).toBe(true);
    expect(results.every(option => option.searchText.includes('arrow'))).toBe(true);
  });

  it('returns nothing for an empty query', () => {
    expect(searchIconOptions('  ', RECOMMENDED_ICON_OPTIONS, LUCIDE_ICON_OPTIONS)).toEqual([]);
  });
});

describe('DataMartIconGlyph', () => {
  it('draws a library icon once the library loads, and the default for an unknown one', async () => {
    const { container, rerender } = render(<DataMartIconGlyph icon='lucide:rocket' />);
    await waitFor(() => {
      expect(container.querySelector('svg.lucide-rocket')).not.toBeNull();
    });

    rerender(<DataMartIconGlyph icon='lucide:no-such-icon' />);
    expect(container.querySelector('svg.lucide-box')).not.toBeNull();

    rerender(<DataMartIconGlyph icon='purchases' />);
    expect(container.querySelector('svg.lucide-shopping-cart')).not.toBeNull();
  });
});

describe('DataMartIconPicker', () => {
  const open = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Change Data Mart icon' }));
  };
  const search = (text: string) => {
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search icons' }), {
      target: { value: text },
    });
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

  it('lists the recommended icons in registry order, then the library without repeats', async () => {
    render(<DataMartIconPicker icon={null} onChange={vi.fn()} />);
    open();

    const recommended = within(
      screen.getByRole('group', { name: 'Recommended icons' })
    ).getAllByRole('button');
    expect(recommended.map(button => button.getAttribute('aria-label'))).toEqual(
      DATA_MART_ICON_OPTIONS.map(option => option.label)
    );

    const library = within(await screen.findByRole('group', { name: 'All icons' })).getAllByRole(
      'button'
    );
    expect(library.length).toBeGreaterThan(0);
    // Shopping cart is the recommended "Purchases" glyph, so the library does not repeat it.
    expect(library.map(button => button.getAttribute('aria-label'))).not.toContain('Shopping cart');
  });

  it('draws more library icons as the list scrolls', async () => {
    render(<DataMartIconPicker icon={null} onChange={vi.fn()} />);
    open();
    const group = await screen.findByRole('group', { name: 'All icons' });
    const before = within(group).getAllByRole('button').length;

    fireEvent.scroll(screen.getByTestId('dataMartIconPickerList'));

    expect(within(group).getAllByRole('button').length).toBeGreaterThan(before);
  });

  it('saves a library icon found by search, and marks it as selected next time', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<DataMartIconPicker icon={null} onChange={onChange} />);

    open();
    search('rocket');
    fireEvent.click(await screen.findByRole('button', { name: 'Rocket' }));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('lucide:rocket');
    });

    rerender(<DataMartIconPicker icon='lucide:rocket' onChange={onChange} />);
    open();
    search('rocket');
    expect(await screen.findByRole('button', { name: 'Rocket' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('picks the first match on Enter and says when nothing matches', async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(<DataMartIconPicker icon={null} onChange={onChange} />);

    open();
    await screen.findByRole('group', { name: 'All icons' });
    search('zzzz');
    expect(screen.getByText('No icons match “zzzz”.')).toBeInTheDocument();

    search('cart');
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search icons' }), { key: 'Enter' });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('purchases');
    });
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
