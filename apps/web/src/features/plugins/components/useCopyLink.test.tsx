import { act, fireEvent, render, screen } from '@testing-library/react';
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

  it('copies while the member is interacting with the page', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText }, userActivation: { isActive: true } });
    render(<Probe />);

    await act(() => copy('https://app.owox.test/x'));

    expect(writeText).toHaveBeenCalledWith('https://app.owox.test/x');
    expect(success).toHaveBeenCalledWith('Link copied', { id: 'plugin-link-copied' });
  });

  it('refuses to copy when the member is not interacting with the page', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText }, userActivation: { isActive: false } });
    render(<Probe />);

    await act(() => expect(copy('https://app.owox.test/x')).rejects.toThrow());

    expect(writeText).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses a second copy while the first is still in progress', async () => {
    let finish: () => void = () => undefined;
    const writeText = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    vi.stubGlobal('navigator', { clipboard: { writeText }, userActivation: { isActive: true } });
    render(<Probe />);

    const first = copy('https://app.owox.test/first');
    await act(() => expect(copy('https://app.owox.test/second')).rejects.toThrow());
    finish();
    await act(() => first);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('https://app.owox.test/first');
    expect(success).toHaveBeenCalledTimes(1);
  });

  it('refuses to copy while the fallback dialog is open, and copies again once it closes', async () => {
    const writeText = vi
      .fn<(url: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText }, userActivation: { isActive: true } });
    render(<Probe />);
    await act(() => copy('https://app.owox.test/first'));

    await act(() => expect(copy('https://app.owox.test/second')).rejects.toThrow());

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('https://app.owox.test/first')).toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await act(() => copy('https://app.owox.test/third'));

    expect(writeText).toHaveBeenLastCalledWith('https://app.owox.test/third');
    expect(success).toHaveBeenCalledTimes(1);
  });
});
