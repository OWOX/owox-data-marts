import { describe, expect, it } from 'vitest';
import { runFiltersFrom } from './runFilters';

const PLUGIN = '0f8fad5b-d9cb-469f-a165-70867728950e';
const SCHEDULE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const NONE = { statuses: [], source: null, plugin: null, schedule: null, owner: null };

describe('runFiltersFrom', () => {
  it('sends no filter for an empty URL', () => {
    expect(runFiltersFrom(NONE, true)).toEqual({ statuses: [] });
  });

  it('maps every filter, each source to its trigger', () => {
    expect(
      runFiltersFrom(
        {
          statuses: ['FAILED', 'TIMED_OUT'],
          source: 'page',
          plugin: PLUGIN,
          schedule: SCHEDULE,
          owner: 'u1',
        },
        true
      )
    ).toEqual({
      statuses: ['FAILED', 'TIMED_OUT'],
      trigger: 'frontend',
      pluginId: PLUGIN,
      scheduleId: SCHEDULE,
      userId: 'u1',
    });
    expect(runFiltersFrom({ ...NONE, source: 'schedule' }, true)).toEqual({
      statuses: [],
      trigger: 'schedule',
    });
  });

  it('drops an unknown status or source, and the owner for anyone but an admin', () => {
    expect(
      runFiltersFrom(
        { ...NONE, statuses: ['FAILED', 'active'], source: 'cron', owner: 'u1' },
        false
      )
    ).toEqual({ statuses: ['FAILED'] });
  });

  // An edited or truncated link would otherwise leave only the error, with no Clear filters.
  it('drops a plugin or schedule that is not an id', () => {
    expect(
      runFiltersFrom({ ...NONE, plugin: 'metric-watch', schedule: SCHEDULE.slice(1) }, true)
    ).toEqual({ statuses: [] });
  });
});
