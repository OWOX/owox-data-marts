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
    const allMembers = await this.idpProjectionsFacade.getProjectMembers(command.projectId);
    const activeMembers = allMembers.filter(m => !m.isOutbound);
    const memberIds = new Set(activeMembers.map(m => m.userId));

    const settings = await this.settingsService.getOrCreateDefaultSettings(
      command.projectId,
      type => NOTIFICATION_DEFINITIONS[type].getDefaultReceivers(activeMembers)
    );

    // Remove receivers who are no longer project members.
    // Skip cleanup when member list is empty — likely an IDP failure, not an empty project.
    if (activeMembers.length > 0) {
      for (const s of settings) {
        const validReceivers = s.receivers.filter(id => memberIds.has(id));
        if (validReceivers.length !== s.receivers.length) {
          s.receivers = validReceivers;
          await this.settingsService.updateReceivers(s.id, validReceivers);
        }
      }
    }

    const allReceiverIds = new Set<string>();
    for (const s of settings) {
      for (const receiverId of s.receivers) {
        allReceiverIds.add(receiverId);
      }
    }

    // Fetch profile data (email, name, avatar) for all receiver IDs from the local cache.
    const userProjectionList = await this.idpProjectionsFacade.getUserProjectionList(
      Array.from(allReceiverIds)
    );
    const userMap = new Map<
      string,
      {
        userId: string;
        email?: string | null;
        fullName?: string | null;
        avatar?: string | null;
        hasNotificationsEnabled?: boolean;
      }
    >(userProjectionList.projections.map(u => [u.userId, u]));

    // Overlay hasNotificationsEnabled from the IDP members response.
    const membersMap = new Map(activeMembers.map(m => [m.userId, m]));
    for (const [userId, projection] of userMap) {
      const member = membersMap.get(userId);
      if (member) {
        userMap.set(userId, {
          ...projection,
          hasNotificationsEnabled: member.hasNotificationsEnabled,
        });
      }
    }

    return {
      settings: this.mapper.toResponseList(settings, userMap),
    };
  }
}
