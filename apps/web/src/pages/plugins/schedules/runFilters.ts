import { isPluginRunStatus, type PluginRunFilters } from '../../../features/plugins';

export interface RunFilterParams {
  statuses: readonly string[];
  source: string | null;
  plugin: string | null;
  schedule: string | null;
  owner: string | null;
}

// As the API checks plugin and schedule ids; anything else would fail the whole list.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidOrNull = (value: string | null) =>
  value !== null && UUID.test(value) ? value : null;

/** The URL's filters as the API takes them; an unknown status, source or id is dropped. */
export function runFiltersFrom(params: RunFilterParams, isAdmin: boolean): PluginRunFilters {
  const pluginId = uuidOrNull(params.plugin);
  const scheduleId = uuidOrNull(params.schedule);
  const trigger =
    params.source === 'page' ? 'frontend' : params.source === 'schedule' ? 'schedule' : undefined;
  return {
    statuses: params.statuses.filter(isPluginRunStatus),
    ...(trigger && { trigger }),
    ...(pluginId !== null && { pluginId }),
    ...(scheduleId !== null && { scheduleId }),
    // The API ignores it for anyone else; leaving it out keeps their cache key honest.
    ...(isAdmin && params.owner !== null && { userId: params.owner }),
  };
}
