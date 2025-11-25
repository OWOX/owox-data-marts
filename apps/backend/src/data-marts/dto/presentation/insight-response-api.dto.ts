import { ApiProperty } from '@nestjs/swagger';
import { DataMartRunResponseApiDto } from './data-mart-run-response-api.dto';

export class InsightResponseApiDto {
  @ApiProperty({ example: 'b1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890' })
  id: string;

  @ApiProperty({ example: 'Analysis Q4 2025' })
  title: string;

  @ApiProperty({ example: 'Template text with prompts', required: false, nullable: true })
  template: string | null;

  @ApiProperty({
    example: 'Executive summary: ...',
    required: false,
    nullable: true,
  })
  output: string | null;

  @ApiProperty({
    example: '2025-10-09T15:13:06.930Z',
    required: false,
    nullable: true,
    description: 'Timestamp when the output field was last updated',
  })
  outputUpdatedAt: string | Date | null;

  @ApiProperty({ example: '540734f6-8eb1-48a9-bf86-22010d3bddfd' })
  createdById: string;

  @ApiProperty({ example: '2025-10-09T15:13:06.930Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2025-10-09T15:13:06.930Z' })
  modifiedAt: string | Date;

  @ApiProperty({
    required: false,
    nullable: true,
    type: () => DataMartRunResponseApiDto,
    description: 'Latest manual DataMart run for this Insight',
  })
  lastManualDataMartRun: DataMartRunResponseApiDto | null;
}
