/** One piece of work that the host's loading bar shows. */
export interface PluginLoading {
  /**
   * Sets the progress of this work as a fraction from 0 to 1. Until you set it, the bar shows no amount.
   *
   * A value below 0 counts as 0 and a value above 1 counts as 1. NaN and non-numbers are ignored.
   */
  setProgress(fraction: number): void;
  /** Ends this work. The bar hides when all started work has stopped. A second call does nothing. */
  stop(): void;
}

export interface PluginLoadingState {
  active: boolean;
  progress?: number;
}

/**
 * Merges all started work into one bar state and sends only the changes.
 *
 * The state is merged here, not in the host: the host keeps one value for each plugin,
 * and a plugin that sets progress in a loop sends at most one message for each percent.
 */
export function createPluginLoading(
  send: (state: PluginLoadingState) => void
): () => PluginLoading {
  const started = new Map<object, number | undefined>();
  let lastSent: string | undefined;

  const report = () => {
    const values = [...started.values()];
    const progress =
      values.length > 0 && values.every(value => value !== undefined)
        ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
        : undefined;
    const state: PluginLoadingState =
      progress === undefined ? { active: values.length > 0 } : { active: true, progress };
    const key = JSON.stringify(state);
    if (key !== lastSent) {
      lastSent = key;
      send(state);
    }
  };

  return () => {
    const work = {};
    started.set(work, undefined);
    report();
    return {
      setProgress(fraction: number) {
        // A display call must not break the plugin's work, so it clamps or ignores bad input.
        if (typeof fraction !== 'number' || Number.isNaN(fraction) || !started.has(work)) return;
        started.set(work, Math.min(1, Math.max(0, fraction)));
        report();
      },
      stop() {
        if (started.delete(work)) report();
      },
    };
  };
}
