import { ApiProperty } from '@nestjs/swagger';
import { NotificationSettingsItemResponseApiDto } from './notification-settings-item-response-api.dto';

export class NotificationSettingsResponseApiDto {
  @ApiProperty({ type: [NotificationSettingsItemResponseApiDto] })
  settings: NotificationSettingsItemResponseApiDto[];
}
