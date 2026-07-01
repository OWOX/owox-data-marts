import { ApiService } from '../../../../services';
import type {
  NotificationSettingsResponse,
  NotificationSettingsItem,
  UpdateNotificationSettingsRequest,
  ProjectMembersResponse,
  NotificationType,
} from '../types';

// Endpoints are scoped to the authenticated project via AuthorizationContext on
// the backend — the URL no longer carries a project id.
export class NotificationSettingsService extends ApiService {
  constructor() {
    super('/projects/notification-settings');
  }

  async getSettings(): Promise<NotificationSettingsResponse> {
    return this.get<NotificationSettingsResponse>('');
  }

  async updateSetting(
    notificationType: NotificationType,
    data: UpdateNotificationSettingsRequest
  ): Promise<NotificationSettingsItem> {
    return this.put<NotificationSettingsItem>(`/${notificationType}`, data);
  }

  async getProjectMembers(): Promise<ProjectMembersResponse> {
    return this.get<ProjectMembersResponse>('/members');
  }

  async testWebhook(notificationType: NotificationType, webhookUrl: string): Promise<void> {
    return this.post(`/${notificationType}/test-webhook`, { webhookUrl });
  }
}

export const notificationSettingsService = new NotificationSettingsService();
