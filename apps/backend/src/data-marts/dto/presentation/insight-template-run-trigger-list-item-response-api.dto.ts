import { ApiProperty } from '@nestjs/swagger';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import { InsightTemplateRunResponseApiDto } from './insight-template-run-response-api.dto';

export class InsightTemplateRunTriggerListItemResponseApiDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '8a0d9a7c-4a1d-4a5d-8f2a-9b6f3d1c2e4b' })
  insightTemplateId: string;

  @ApiProperty({ enum: TriggerStatus, example: TriggerStatus.IDLE })
  status: TriggerStatus;

  @ApiProperty({ nullable: true })
  uiResponse: InsightTemplateRunResponseApiDto | null;

  @ApiProperty({ example: '2026-02-14T15:13:06.930Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2026-02-14T15:20:11.525Z' })
  modifiedAt: string | Date;
}
