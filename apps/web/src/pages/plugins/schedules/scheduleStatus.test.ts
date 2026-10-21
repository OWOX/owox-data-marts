import { describe, expect, it } from 'vitest';
import { isScheduleStatus, scheduleStatus } from './scheduleStatus';

describe('scheduleStatus', () => {
  it.each([
    [
      'a removed plugin, whatever enabled says',
      { installationState: 'uninstalled', disabledReason: null, enabled: true },
      'removed',
    ],
    [
      'a removed plugin over a disabled reason',
      { installationState: 'uninstalled', disabledReason: 'OWNER_NOT_MEMBER', enabled: false },
      'removed',
    ],
    [
      'a disabled reason',
      { installationState: 'installed', disabledReason: 'ACTION_NOT_DECLARED', enabled: false },
      'disabled',
    ],
    [
      'a pause by a project admin',
      { installationState: 'installed', disabledReason: 'PAUSED_BY_ADMIN', enabled: false },
      'paused',
    ],
    [
      'a schedule not enabled',
      { installationState: 'installed', disabledReason: null, enabled: false },
      'paused',
    ],
    [
      'an enabled schedule',
      { installationState: 'installed', disabledReason: null, enabled: true },
      'active',
    ],
  ] as const)('reads %s', (_case, schedule, status) => {
    expect(scheduleStatus(schedule)).toBe(status);
  });

  it('knows its own statuses only', () => {
    expect(isScheduleStatus('paused')).toBe(true);
    expect(isScheduleStatus('FAILED')).toBe(false);
  });
});
