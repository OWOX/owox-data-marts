import { Injectable } from '@nestjs/common';
import { ProjectNotificationSettings } from '../entities/project-notification-settings.entity';
import { ReceiverInfoApiDto } from '../dto/presentation/receiver-info-api.dto';
import { NotificationSettingsItemResponseApiDto } from '../dto/presentation/notification-settings-item-response-api.dto';
import { NOTIFICATION_TITLES } from '../enums/notification-type.enum';

type UserProjection = {
  userId: string;
  email?: string | null;
  fullName?: string | null;
  avatar?: string | null;
};

@Injectable()
export class NotificationSettingsMapper {
  toResponseItem(
    entity: ProjectNotificationSettings,
    userMap: Map<string, UserProjection>
  ): NotificationSettingsItemResponseApiDto {
    const receivers: ReceiverInfoApiDto[] = entity.receivers
      .map((receiverId): ReceiverInfoApiDto | null => {
        const user = userMap.get(receiverId);
        if (!user || !user.email) return null;
        return {
          userId: user.userId,
          email: user.email,
          displayName: user.fullName ?? undefined,
          avatarUrl: user.avatar ?? undefined,
          hasNotificationsEnabled: true,
        };
      })
      .filter((r): r is ReceiverInfoApiDto => r !== null);

    return {
      id: entity.id,
      notificationType: entity.notificationType,
      title: NOTIFICATION_TITLES[entity.notificationType],
      enabled: entity.enabled,
      receivers,
      webhookUrl: entity.webhookUrl,
      groupingDelayCron: entity.groupingDelayCron,
      lastRunAt: entity.lastRunAt?.toISOString() ?? null,
      nextRunAt: entity.nextRunAt?.toISOString() ?? null,
      createdAt: entity.createdAt.toISOString(),
      modifiedAt: entity.modifiedAt.toISOString(),
    };
  }

  toResponseList(
    entities: ProjectNotificationSettings[],
    userMap: Map<string, UserProjection>
  ): NotificationSettingsItemResponseApiDto[] {
    return entities.map(entity => this.toResponseItem(entity, userMap));
  }
}
