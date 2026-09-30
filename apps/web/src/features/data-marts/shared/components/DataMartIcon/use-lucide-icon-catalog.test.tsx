import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataMartIconGlyph } from './DataMartIconGlyph';
import { DataMartIconPicker } from './DataMartIconPicker';
import { waitForDataMartIcons } from './use-lucide-icon-catalog';

// The catalogue chunk cannot be fetched, e.g. a tab left open across a deploy.
vi.mock('./lucide-icon-catalog', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('when the icon library fails to load', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  afterEach(() => {
    consoleError.mockClear();
  });

  it('draws the default icon instead of a blank one', async () => {
    const { container } = render(<DataMartIconGlyph icon='lucide:rocket' />);
    await waitFor(() => {
      expect(container.querySelector('svg.lucide-box')).not.toBeNull();
    });
    expect(consoleError).toHaveBeenCalled();
  });

  it('says so in the picker instead of loading forever, and keeps the recommended icons', async () => {
    render(<DataMartIconPicker icon={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Data Mart icon' }));

    expect(
      await screen.findByText('Couldn’t load all icons. Reopen the picker to try again.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading all icons…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchases' })).toBeInTheDocument();
  });

  it('still lets an image export go ahead', async () => {
    await expect(waitForDataMartIcons(['lucide:rocket'])).resolves.toBeUndefined();
  });
});
