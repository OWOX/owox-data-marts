import { ApiProperty } from '@nestjs/swagger';

export class InsightTemplateListItemResponseApiDto {
  @ApiProperty({ example: 'b1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890' })
  id: string;

  @ApiProperty({ example: 'Summary' })
  title: string;

  @ApiProperty({ example: 1, description: 'Number of configured sources in template' })
  sourcesCount: number;

  @ApiProperty({ nullable: true })
  outputUpdatedAt: string | Date | null;

  @ApiProperty({ example: '540734f6-8eb1-48a9-bf86-22010d3bddfd' })
  createdById: string;

  @ApiProperty({ example: '2026-02-14T15:13:06.930Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2026-02-14T15:13:06.930Z' })
  modifiedAt: string | Date;
}
