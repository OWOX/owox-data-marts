import type { MouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openLinkWhenResolved, WAIT_FOR_LINK_MS } from './open-link-when-resolved';

const FALLBACK = 'https://docs.google.com/spreadsheets/d/abc/edit';
const TAB = 'https://docs.google.com/spreadsheets/d/abc/edit#gid=42';

function click(modifiers: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  return {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...modifiers,
  } as unknown as MouseEvent<HTMLAnchorElement> & { preventDefault: ReturnType<typeof vi.fn> };
}

function mockOpenedTab() {
  const tab = { opener: {} as unknown, location: { replace: vi.fn() } };
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  return { tab, open };
}

describe('openLinkWhenResolved', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens the tab at once and sends it to the resolved link', async () => {
    const { tab, open } = mockOpenedTab();
    const event = click();

    openLinkWhenResolved(FALLBACK, () => Promise.resolve(TAB))(event);

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(tab.opener).toBeNull();
    await vi.waitFor(() => {
      expect(tab.location.replace).toHaveBeenCalledWith(TAB);
    });
  });

  it('sends the tab to the fallback when nothing resolves or the lookup fails', async () => {
    const { tab } = mockOpenedTab();

    openLinkWhenResolved(FALLBACK, () => Promise.resolve(undefined))(click());
    openLinkWhenResolved(FALLBACK, () => Promise.reject(new Error('403')))(click());

    await vi.waitFor(() => {
      expect(tab.location.replace).toHaveBeenCalledTimes(2);
    });
    expect(tab.location.replace).toHaveBeenNthCalledWith(1, FALLBACK);
    expect(tab.location.replace).toHaveBeenNthCalledWith(2, FALLBACK);
  });

  it('gives up waiting after the timeout and opens the fallback', async () => {
    vi.useFakeTimers();
    const { tab } = mockOpenedTab();

    openLinkWhenResolved(FALLBACK, () => new Promise(() => undefined))(click());
    await vi.advanceTimersByTimeAsync(WAIT_FOR_LINK_MS);

    expect(tab.location.replace).toHaveBeenCalledWith(FALLBACK);
  });

  it('leaves a modified click and a blocked pop-up to the plain fallback link', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const resolve = vi.fn(() => Promise.resolve(TAB));

    const withModifier = click({ metaKey: true });
    openLinkWhenResolved(FALLBACK, resolve)(withModifier);
    expect(open).not.toHaveBeenCalled();
    expect(withModifier.preventDefault).not.toHaveBeenCalled();

    const blocked = click();
    openLinkWhenResolved(FALLBACK, resolve)(blocked);
    expect(open).toHaveBeenCalledTimes(1);
    expect(blocked.preventDefault).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });
});
