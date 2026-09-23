import { describe, expect, it, vi } from 'vitest';
import { reloadOnStaleChunk } from './reload-on-stale-chunk';

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
  it('reloads the page and swallows the error when a chunk fails to load', () => {
    const { target, fire } = setup(1_000_000);

    const event = fire();

    expect(target.location.reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not reload again when the chunk fails right after a reload', () => {
    const { target, fire } = setup(1_000_000);

    fire();
    const second = fire();

    expect(target.location.reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it('reloads again for a failure long after the previous reload', () => {
    const { target, fire } = setup(1_000_000);
    fire();

    target.now = () => 1_000_000 + 60_000;
    fire();

    expect(target.location.reload).toHaveBeenCalledTimes(2);
  });
});
