import { Injectable } from '@nestjs/common';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { ProjectNotificationSettingsService } from '../services/project-notification-settings.service';
import { NotificationSettingsMapper } from '../mappers/notification-settings.mapper';
import { GetNotificationSettingsCommand } from '../dto/domain/get-notification-settings.command';
import { NotificationSettingsResponseApiDto } from '../dto/presentation/notification-settings-response-api.dto';
import { NOTIFICATION_DEFINITIONS } from '../definitions';

@Injectable()
export class GetNotificationSettingsService {
  constructor(
    private readonly settingsService: ProjectNotificationSettingsService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade,
    private readonly mapper: NotificationSettingsMapper
  ) {}

  async run(command: GetNotificationSettingsCommand): Promise<NotificationSettingsResponseApiDto> {
    const members = await this.idpProjectionsFacade.getProjectMembers(command.projectId);

    const settings = await this.settingsService.getOrCreateDefaultSettings(
      command.projectId,
      type => NOTIFICATION_DEFINITIONS[type].getDefaultReceivers(members)
    );

    const allReceiverIds = new Set<string>();
    for (const s of settings) {
      for (const receiverId of s.receivers) {
        allReceiverIds.add(receiverId);
      }
    }

    const userProjectionList = await this.idpProjectionsFacade.getUserProjectionList(
      Array.from(allReceiverIds)
    );
    const userMap = new Map(userProjectionList.projections.map(u => [u.userId, u]));

    return {
      settings: this.mapper.toResponseList(settings, userMap),
    };
  }
}
