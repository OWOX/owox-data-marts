import { NotificationType } from '../../enums/notification-type.enum';

export class TestNotificationWebhookCommand {
  constructor(
    public readonly projectId: string,
    public readonly notificationType: NotificationType,
    public readonly webhookUrl: string | undefined,
    public readonly userId: string | undefined,
    public readonly projectTitle: string | undefined
  ) {}
}
