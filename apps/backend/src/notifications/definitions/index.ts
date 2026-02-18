import { NotificationType } from '../enums/notification-type.enum';
import { BaseNotification } from '../types/base-notification';
import { FailedRunsAllDmNotification } from './failed-runs-all-dm.notification';
import { SuccessfulRunsAllDmNotification } from './successful-runs-all-dm.notification';

export { FailedRunsAllDmNotification } from './failed-runs-all-dm.notification';
export { SuccessfulRunsAllDmNotification } from './successful-runs-all-dm.notification';

export const NOTIFICATION_DEFINITIONS: Record<NotificationType, BaseNotification> = {
  [NotificationType.FAILED_RUNS_ALL_DM]: new FailedRunsAllDmNotification(),
  [NotificationType.SUCCESSFUL_RUNS_ALL_DM]: new SuccessfulRunsAllDmNotification(),
};
