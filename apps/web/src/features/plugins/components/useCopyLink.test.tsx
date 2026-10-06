import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const success = vi.fn();
vi.mock('react-hot-toast', () => ({
  default: { success: (...args: unknown[]) => success(...args) },
}));

import { useCopyLink } from './useCopyLink';

const captured: { current: ((url: string) => Promise<void>) | null } = { current: null };
function Probe() {
  const { copyLink, fallbackDialog } = useCopyLink();
  captured.current = copyLink;
  return <>{fallbackDialog}</>;
}
const copy = (url: string) => captured.current!(url);

describe('useCopyLink', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('copies the link and confirms it', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<Probe />);

    await act(() => copy('https://app.owox.test/ui/1/plugins/p1'));

    expect(writeText).toHaveBeenCalledWith('https://app.owox.test/ui/1/plugins/p1');
    expect(success).toHaveBeenCalledWith('Link copied', { id: 'plugin-link-copied' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the link to copy by hand when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    });
    render(<Probe />);

    await act(() => copy('https://app.owox.test/ui/1/plugins/p1'));

    expect(screen.getByRole('dialog', { name: 'Copy this link' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://app.owox.test/ui/1/plugins/p1')).toHaveAttribute(
      'readonly'
    );
    expect(success).not.toHaveBeenCalled();
  });

  it('falls back when the page has no clipboard at all', async () => {
    vi.stubGlobal('navigator', {});
    render(<Probe />);

    await act(() => copy('https://app.owox.test/x'));

    expect(screen.getByRole('dialog', { name: 'Copy this link' })).toBeInTheDocument();
  });
});
