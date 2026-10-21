import { describe, expect, it } from 'vitest';
import { isScheduleStatus, scheduleStatus } from './scheduleStatus';

describe('scheduleStatus', () => {
  it.each([
    [
      'a removed plugin, whatever enabled says',
      {
        installationState: 'uninstalled',
        disabledReason: null,
        enabled: true,
        ownerIsMember: true,
      },
      'removed',
    ],
    [
      'a removed plugin over a disabled reason',
      {
        installationState: 'uninstalled',
        disabledReason: 'ACTION_NOT_DECLARED',
        enabled: false,
        ownerIsMember: true,
      },
      'removed',
    ],
    [
      'a disabled reason',
      {
        installationState: 'installed',
        disabledReason: 'ACTION_NOT_DECLARED',
        enabled: false,
        ownerIsMember: true,
      },
      'disabled',
    ],
    [
      'a pause by a project admin',
      {
        installationState: 'installed',
        disabledReason: 'PAUSED_BY_ADMIN',
        enabled: false,
        ownerIsMember: true,
      },
      'paused',
    ],
    [
      'a schedule not enabled',
      { installationState: 'installed', disabledReason: null, enabled: false, ownerIsMember: true },
      'paused',
    ],
    [
      'an enabled schedule whose owner left the project',
      {
        installationState: 'installed',
        disabledReason: null,
        enabled: true,
        ownerIsMember: false,
      },
      'owner-not-member',
    ],
    [
      'a paused schedule whose owner left the project',
      {
        installationState: 'installed',
        disabledReason: null,
        enabled: false,
        ownerIsMember: false,
      },
      'paused',
    ],
    [
      'an owner the IDP could not check as a member',
      { installationState: 'installed', disabledReason: null, enabled: true, ownerIsMember: null },
      'active',
    ],
    [
      'an enabled schedule',
      { installationState: 'installed', disabledReason: null, enabled: true, ownerIsMember: true },
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
