import { Injectable } from '@nestjs/common';
import { IdpProjectionsService } from '../../idp/services/idp-projections.service';
import { ProjectNotificationSettingsService } from '../services/project-notification-settings.service';
import { NotificationSettingsMapper } from '../mappers/notification-settings.mapper';
import { UpsertNotificationSettingCommand } from '../dto/domain/upsert-notification-setting.command';
import { NotificationSettingsItemResponseApiDto } from '../dto/presentation/notification-settings-item-response-api.dto';

@Injectable()
export class UpsertNotificationSettingService {
  constructor(
    private readonly settingsService: ProjectNotificationSettingsService,
    private readonly idpProjectionsService: IdpProjectionsService,
    private readonly mapper: NotificationSettingsMapper
  ) {}

  async run(
    command: UpsertNotificationSettingCommand
  ): Promise<NotificationSettingsItemResponseApiDto> {
    const settings = await this.settingsService.upsert(
      command.projectId,
      command.notificationType,
      {
        enabled: command.enabled,
        receivers: command.receivers,
        webhookUrl: command.webhookUrl,
        groupingDelayCron: command.groupingDelayCron,
      }
    );

    const userProjections = await this.idpProjectionsService.getUserProjectionList(
      settings.receivers
    );
    const userMap = new Map(userProjections.map(u => [u.userId, u]));

    return this.mapper.toResponseItem(settings, userMap);
  }
}
