import { ApiService } from '../../../../services';
import type {
  NotificationSettingsResponse,
  NotificationSettingsItem,
  UpdateNotificationSettingsRequest,
  ProjectMembersResponse,
  NotificationType,
} from '../types';

export class NotificationSettingsService extends ApiService {
  constructor() {
    super('/projects');
  }

  async getSettings(projectId: string): Promise<NotificationSettingsResponse> {
    return this.get<NotificationSettingsResponse>(`/${projectId}/notification-settings`);
  }

  async updateSetting(
    projectId: string,
    notificationType: NotificationType,
    data: UpdateNotificationSettingsRequest
  ): Promise<NotificationSettingsItem> {
    return this.put<NotificationSettingsItem>(
      `/${projectId}/notification-settings/${notificationType}`,
      data
    );
  }

  async getProjectMembers(projectId: string): Promise<ProjectMembersResponse> {
    return this.get<ProjectMembersResponse>(`/${projectId}/notification-settings/members`);
  }

  async testWebhook(
    projectId: string,
    notificationType: NotificationType,
    webhookUrl: string
  ): Promise<void> {
    return this.post(`/${projectId}/notification-settings/${notificationType}/test-webhook`, {
      webhookUrl,
    });
  }
}

export const notificationSettingsService = new NotificationSettingsService();
