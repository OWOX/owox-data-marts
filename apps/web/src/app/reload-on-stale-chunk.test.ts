import { describe, expect, it, vi } from 'vitest';
import { isReloadingForStaleChunk, reloadOnStaleChunk } from './reload-on-stale-chunk';

const FIVE_MINUTES = 5 * 60_000;

function setup(now: number) {
  const listeners = new Map<string, (event: Event) => void>();
  const store = new Map<string, string>();
  const target = {
    addEventListener: ((type: string, listener: (event: Event) => void) => {
      listeners.set(type, listener);
    }) as Window['addEventListener'],
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
    location: { reload: vi.fn() },
    now: () => now,
  };
  reloadOnStaleChunk(target);
  const fire = () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    listeners.get('vite:preloadError')?.(event);
    return event;
  };
  return { target, fire };
}

describe('reloadOnStaleChunk', () => {
  it('reloads the page, swallows the error, and marks the page as reloading', () => {
    const { target, fire } = setup(1_000_000);
    expect(isReloadingForStaleChunk()).toBe(false);

    const event = fire();

    expect(target.location.reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    expect(isReloadingForStaleChunk()).toBe(true);
  });

  it('reloads once when the CSS dependency and the chunk itself both fail on the same page', () => {
    const { target, fire } = setup(1_000_000);

    fire();
    const second = fire();

    expect(target.location.reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
    expect(isReloadingForStaleChunk()).toBe(true);
  });

  it('does not reload again when the chunk fails within five minutes of a reload', () => {
    const { target, fire } = setup(1_000_000);
    fire();

    target.now = () => 1_000_000 + FIVE_MINUTES - 1;
    fire();

    expect(target.location.reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again for a failure after the window has passed', () => {
    const { target, fire } = setup(1_000_000);
    fire();

    target.now = () => 1_000_000 + FIVE_MINUTES;
    fire();

    expect(target.location.reload).toHaveBeenCalledTimes(2);
  });
});
