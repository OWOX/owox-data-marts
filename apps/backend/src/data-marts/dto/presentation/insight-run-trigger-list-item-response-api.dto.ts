import { ApiProperty } from '@nestjs/swagger';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import { InsightRunResponseApiDto } from './insight-run-response-api.dto';

export class InsightRunTriggerListItemResponseApiDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '8a0d9a7c-4a1d-4a5d-8f2a-9b6f3d1c2e4b' })
  insightId: string;

  @ApiProperty({
    enum: TriggerStatus,
    example: TriggerStatus.IDLE,
    description: 'Current trigger status',
  })
  status: TriggerStatus;

  @ApiProperty({
    description: 'UI response for this trigger (e.g., { runId } or { error })',
    nullable: true,
  })
  uiResponse: InsightRunResponseApiDto | null;

  @ApiProperty({ example: '2025-10-09T15:13:06.930Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2025-10-09T15:20:11.525Z' })
  modifiedAt: string | Date;
}
