import { ApiProperty } from '@nestjs/swagger';
import { ScheduledTriggerConfig } from '../../scheduled-trigger-types/scheduled-trigger-config.type';
import { ScheduledTriggerType } from '../../scheduled-trigger-types/enums/scheduled-trigger-type.enum';

export class ScheduledTriggerResponseApiDto {
  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  id: string;

  @ApiProperty({ enum: ScheduledTriggerType, example: ScheduledTriggerType.CONNECTOR_RUN })
  type: ScheduledTriggerType;

  @ApiProperty({ example: '0 0 * * *' })
  cronExpression: string;

  @ApiProperty({ example: 'UTC' })
  timeZone: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z', nullable: true })
  nextRunTimestamp: Date | null;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z', nullable: true })
  lastRunTimestamp: Date | null;

  @ApiProperty({ nullable: true })
  triggerConfig?: ScheduledTriggerConfig;

  @ApiProperty({ example: '9cabc24e-1234-4a5a-8b12-abcdef123456' })
  createdById: string;

  @ApiProperty({ example: '2024-01-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-01-02T15:30:00.000Z' })
  modifiedAt: Date;
}
