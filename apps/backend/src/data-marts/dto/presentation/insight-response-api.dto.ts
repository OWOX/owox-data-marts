import { ApiProperty } from '@nestjs/swagger';

export class InsightResponseApiDto {
  @ApiProperty({ example: 'b1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890' })
  id: string;

  @ApiProperty({ example: 'Analysis Q4 2025' })
  title: string;

  @ApiProperty({ example: 'Template text with prompts', required: false, nullable: true })
  template?: string | null;

  @ApiProperty({ example: '540734f6-8eb1-48a9-bf86-22010d3bddfd' })
  createdById: string;

  @ApiProperty({ example: '2025-10-09T15:13:06.930Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2025-10-09T15:13:06.930Z' })
  modifiedAt: string | Date;
}
