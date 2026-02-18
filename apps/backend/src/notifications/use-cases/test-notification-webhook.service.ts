import { BadRequestException, Injectable } from '@nestjs/common';
import { ProjectNotificationSettingsService } from '../services/project-notification-settings.service';
import { NotificationWebhookService } from '../services/notification-webhook.service';
import { TestNotificationWebhookCommand } from '../dto/domain/test-notification-webhook.command';

@Injectable()
export class TestNotificationWebhookService {
  constructor(
    private readonly settingsService: ProjectNotificationSettingsService,
    private readonly webhookService: NotificationWebhookService
  ) {}

  async run(command: TestNotificationWebhookCommand): Promise<void> {
    const resolvedUrl =
      command.webhookUrl ??
      (
        await this.settingsService.findByProjectIdAndType(
          command.projectId,
          command.notificationType
        )
      )?.webhookUrl;

    if (!resolvedUrl) {
      throw new BadRequestException('No webhook URL configured');
    }

    try {
      await this.webhookService.sendTestWebhook(
        resolvedUrl,
        command.notificationType,
        command.projectId,
        { userId: command.userId, projectTitle: command.projectTitle }
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Failed to reach webhook URL'
      );
    }
  }
}
