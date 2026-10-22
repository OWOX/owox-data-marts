import type { ProjectPluginSchedule } from '../../../features/plugins';

export const SCHEDULE_STATUSES = [
  'active',
  'paused',
  'disabled',
  'owner-not-member',
  'removed',
] as const;

export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  disabled: 'Disabled',
  'owner-not-member': 'Owner not a member',
  removed: 'Plugin removed',
};

export function isScheduleStatus(value: string): value is ScheduleStatus {
  return (SCHEDULE_STATUSES as readonly string[]).includes(value);
}

/** A removed plugin comes first: nothing of it runs until it is restored. */
export function scheduleStatus(
  schedule: Pick<
    ProjectPluginSchedule,
    'installationState' | 'disabledReason' | 'enabled' | 'ownerIsMember'
  >
): ScheduleStatus {
  if (schedule.installationState === 'uninstalled') {
    return 'removed';
  }
  // An admin's pause is a pause the member can lift, not a fault.
  if (schedule.disabledReason !== null && schedule.disabledReason !== 'PAUSED_BY_ADMIN') {
    return 'disabled';
  }
  if (schedule.enabled && schedule.ownerIsMember === false) {
    return 'owner-not-member';
  }
  return schedule.enabled ? 'active' : 'paused';
}
