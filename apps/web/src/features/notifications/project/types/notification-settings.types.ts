export type NotificationType = string;

export enum GroupingDelayCron {
  FIVE_MINUTES = '*/5 * * * *',
  FIFTEEN_MINUTES = '*/15 * * * *',
  THIRTY_MINUTES = '*/30 * * * *',
  ONE_HOUR = '0 * * * *',
  TWO_HOURS = '0 */2 * * *',
  SIX_HOURS = '0 */6 * * *',
  TWELVE_HOURS = '0 */12 * * *',
  TWENTY_FOUR_HOURS = '0 0 * * *',
}

export const GROUPING_DELAY_OPTIONS = [
  { value: GroupingDelayCron.FIVE_MINUTES, label: '5 minutes' },
  { value: GroupingDelayCron.FIFTEEN_MINUTES, label: '15 minutes' },
  { value: GroupingDelayCron.THIRTY_MINUTES, label: '30 minutes' },
  { value: GroupingDelayCron.ONE_HOUR, label: '1 hour' },
  { value: GroupingDelayCron.TWO_HOURS, label: '2 hours' },
  { value: GroupingDelayCron.SIX_HOURS, label: '6 hours' },
  { value: GroupingDelayCron.TWELVE_HOURS, label: '12 hours' },
  { value: GroupingDelayCron.TWENTY_FOUR_HOURS, label: '24 hours' },
] as const;

export interface ReceiverInfo {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  hasNotificationsEnabled: boolean;
}

export interface ProjectMember {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
  hasNotificationsEnabled: boolean;
}

export interface NotificationSettingsItem {
  id: string;
  notificationType: NotificationType;
  title: string;
  enabled: boolean;
  receivers: ReceiverInfo[];
  webhookUrl?: string | null;
  groupingDelayCron: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  createdAt: string;
  modifiedAt: string;
}

export interface NotificationSettingsResponse {
  settings: NotificationSettingsItem[];
}

export interface UpdateNotificationSettingsRequest {
  enabled?: boolean;
  receivers?: string[]; // User IDs
  webhookUrl?: string | null;
  groupingDelayCron?: string;
}

export interface ProjectMembersResponse {
  members: ProjectMember[];
}
