import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../../enums/notification-type.enum';
import { ReceiverInfoApiDto } from './receiver-info-api.dto';

export class NotificationSettingsItemResponseApiDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: NotificationType })
  notificationType: NotificationType;

  @ApiProperty()
  title: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty({ type: [ReceiverInfoApiDto] })
  receivers: ReceiverInfoApiDto[];

  @ApiProperty({ required: false, nullable: true })
  webhookUrl?: string | null;

  @ApiProperty()
  groupingDelayCron: string;

  @ApiProperty({ required: false, nullable: true })
  lastRunAt?: string | null;

  @ApiProperty({ required: false, nullable: true })
  nextRunAt?: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  modifiedAt: string;
}
