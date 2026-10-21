import {
  cronToScheduleConfig,
  scheduleConfigToCron,
} from '../../../features/data-marts/scheduled-triggers/components/ScheduleConfig/cron-parser';
import { getScheduleDescription } from '../../../features/data-marts/scheduled-triggers/utils/schedule-utils';

/** The Data Mart summary of a plugin's cron, or null where it would misdescribe it. */
export function describeCron(cron: string): string | null {
  const config = cronToScheduleConfig(cron);
  // The parser reads a list, range or step as its first value; only a cron it builds back is safe.
  const exact =
    config.type !== 'custom' && scheduleConfigToCron(config) === cron.trim().split(/\s+/).join(' ');
  // A step restarts each hour or day, so `*/7` or `0 */5` runs at uneven gaps.
  const cycle = config.intervalType === 'minutes' ? 60 : 24;
  const even = config.type !== 'interval' || cycle % config.intervalValue === 0;
  return exact && even ? getScheduleDescription(config, true) : null;
}
