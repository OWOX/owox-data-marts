import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContextIconGlyph } from './ContextIconGlyph';
import { ContextIconPicker } from './ContextIconPicker';
import { DataMartIconPicker } from '../../../data-marts/shared/components/DataMartIcon';

describe('ContextIconGlyph', () => {
  it('draws the context default icon when none is picked or the key is unknown', () => {
    const { container, rerender } = render(<ContextIconGlyph icon={null} />);
    expect(container.querySelector('svg')).toHaveClass('lucide-tags');

    rerender(<ContextIconGlyph icon='rocket' />);
    expect(container.querySelector('svg')).toHaveClass('lucide-tags');
  });

  it('draws a picked recommended icon', () => {
    const { container } = render(<ContextIconGlyph icon='purchases' />);
    expect(container.querySelector('svg')).toHaveClass('lucide-shopping-cart');
    expect(container.querySelector('.lucide-tags')).toBeNull();
  });
});

describe('ContextIconPicker', () => {
  const open = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Change context icon' }));
  };

  it('shows the context default icon on the tile and reports the picked icon', async () => {
    const onChange = vi.fn();
    render(<ContextIconPicker icon={null} onChange={onChange} />);

    const tile = screen.getByRole('button', { name: 'Change context icon' });
    expect(tile.querySelector('svg')).toHaveClass('lucide-tags');

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Purchases' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('purchases');
    });
  });

  it('reports null on reset', async () => {
    const onChange = vi.fn();
    render(<ContextIconPicker icon='purchases' onChange={onChange} />);

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(null);
    });
  });

  it('opens as a modal popover, so its list stays scrollable inside a sheet', () => {
    render(
      <>
        <p>Outside the picker</p>
        <ContextIconPicker icon={null} onChange={vi.fn()} />
      </>
    );

    open();

    // A modal popover hides the rest of the page from assistive tech and owns the scroll lock.
    expect(screen.getByText('Outside the picker').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('leaves the Data Mart picker non-modal', () => {
    render(
      <>
        <p>Outside the picker</p>
        <DataMartIconPicker icon={null} onChange={vi.fn()} />
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change Data Mart icon' }));

    expect(screen.getByText('Outside the picker').closest('[aria-hidden="true"]')).toBeNull();
  });

  it('cannot be opened while disabled', () => {
    render(<ContextIconPicker icon={null} onChange={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Change context icon' })).toBeDisabled();
  });
});
