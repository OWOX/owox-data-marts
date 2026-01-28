import { NotificationType } from '../../enums/notification-type.enum';

export class UpsertNotificationSettingCommand {
  constructor(
    public readonly projectId: string,
    public readonly notificationType: NotificationType,
    public readonly enabled: boolean | undefined,
    public readonly receivers: string[] | undefined,
    public readonly webhookUrl: string | null | undefined,
    public readonly groupingDelayCron: string | undefined
  ) {}
}
