import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

export type PluginSchedulesTab = 'schedules' | 'runs';

type ParamName = 'tab' | 'schedule' | 'run' | 'plugin' | 'status' | 'source' | 'owner';

export type PluginSchedulesParamChanges = Partial<
  Record<ParamName, string | readonly string[] | null>
>;

/** Plugins → Schedules keeps its whole state in the URL, so every view can be linked. */
export function usePluginSchedulesParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  // react-router makes a new setter on every search change; the ref keeps `update` stable.
  const setRef = useRef(setSearchParams);
  useEffect(() => {
    setRef.current = setSearchParams;
  });

  // Replaces the history entry, so Back leaves the page instead of stepping through filters.
  const update = useCallback((changes: PluginSchedulesParamChanges) => {
    setRef.current(
      prev => {
        const next = new URLSearchParams(prev);
        for (const [name, value] of Object.entries(changes)) {
          next.delete(name);
          if (typeof value === 'string') {
            next.set(name, value);
          } else if (value) {
            for (const item of value) {
              next.append(name, item);
            }
          }
        }
        return next;
      },
      { replace: true }
    );
  }, []);

  /** A link to a tab that keeps the plugin and owner filters. */
  const href = useCallback(
    (tab: PluginSchedulesTab, target: { schedule?: string; run?: string } = {}) => {
      const next = new URLSearchParams();
      if (tab === 'runs') {
        next.set('tab', 'runs');
      }
      if (target.schedule) {
        next.set('schedule', target.schedule);
      }
      if (target.run) {
        next.set('run', target.run);
      }
      for (const name of ['plugin', 'owner'] as const) {
        const value = searchParams.get(name);
        if (value !== null) {
          next.set(name, value);
        }
      }
      return `?${next.toString()}`;
    },
    [searchParams]
  );

  return {
    tab: (searchParams.get('tab') === 'runs' ? 'runs' : 'schedules') as PluginSchedulesTab,
    schedule: searchParams.get('schedule'),
    run: searchParams.get('run'),
    plugin: searchParams.get('plugin'),
    statuses: searchParams.getAll('status'),
    source: searchParams.get('source'),
    owner: searchParams.get('owner'),
    update,
    href,
  };
}
