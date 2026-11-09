import type { MouseEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** A tab with a real blank document, as `window.open('')` gives. */
function mockOpenedTab() {
  const tab = {
    opener: {} as unknown,
    document: document.implementation.createHTMLDocument(''),
    location: { replace: vi.fn() },
  };
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  return { tab, open };
}

// Where each link the tab follows leads, and how; jsdom does not navigate on click.
let followed: { href: string; rel: string }[] = [];

describe('openLinkWhenResolved', () => {
  beforeEach(() => {
    followed = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      followed.push({ href: this.href, rel: this.rel });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens the tab at once, says what it waits for, and sends it to the resolved link', async () => {
    const { tab, open } = mockOpenedTab();
    const event = click();

    openLinkWhenResolved(FALLBACK, () => Promise.resolve(TAB), {
      waitingText: 'Opening Google Sheets…',
    })(event);

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(tab.opener).toBeNull();
    expect(tab.document.title).toBe('Opening Google Sheets…');
    expect(tab.document.body.textContent).toBe('Opening Google Sheets…');
    await vi.waitFor(() => {
      expect(followed).toEqual([{ href: TAB, rel: 'noreferrer' }]);
    });
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it('sends the tab to the fallback when nothing resolves or the lookup fails', async () => {
    mockOpenedTab();

    openLinkWhenResolved(FALLBACK, () => Promise.resolve(undefined))(click());
    openLinkWhenResolved(FALLBACK, () => Promise.reject(new Error('403')))(click());

    await vi.waitFor(() => {
      expect(followed).toHaveLength(2);
    });
    expect(followed.map(link => link.href)).toEqual([FALLBACK, FALLBACK]);
  });

  it('waits as long as the backend bounds the lookup, then opens the fallback', async () => {
    vi.useFakeTimers();
    mockOpenedTab();

    openLinkWhenResolved(FALLBACK, () => new Promise(() => undefined))(click());
    await vi.advanceTimersByTimeAsync(WAIT_FOR_LINK_MS - 1);
    expect(followed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(WAIT_FOR_LINK_MS).toBe(15_000);
    expect(followed).toEqual([{ href: FALLBACK, rel: 'noreferrer' }]);
  });

  it('falls back to location.replace when the tab document cannot be used', async () => {
    const replace = vi.fn();
    const tab = {
      opener: {} as unknown,
      get document(): Document {
        throw new Error('Blocked a frame from accessing a cross-origin frame');
      },
      location: { replace },
    };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);

    openLinkWhenResolved(FALLBACK, () => Promise.resolve(TAB))(click());

    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith(TAB);
    });
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
