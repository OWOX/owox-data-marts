export enum NotificationType {
  FAILED_RUNS_ALL_DM = 'FAILED_RUNS_ALL_DM',
  SUCCESSFUL_RUNS_ALL_DM = 'SUCCESSFUL_RUNS_ALL_DM',
}

export const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  [NotificationType.FAILED_RUNS_ALL_DM]: 'Failed runs for all Data Marts',
  [NotificationType.SUCCESSFUL_RUNS_ALL_DM]: 'Success runs for all Data Marts',
};

export const NOTIFICATION_DEFAULT_ENABLED: Record<NotificationType, boolean> = {
  [NotificationType.FAILED_RUNS_ALL_DM]: true,
  [NotificationType.SUCCESSFUL_RUNS_ALL_DM]: false,
};
