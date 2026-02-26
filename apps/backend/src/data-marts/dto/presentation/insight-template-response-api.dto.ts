import { ApiProperty } from '@nestjs/swagger';
import { DataMartRunResponseApiDto } from './data-mart-run-response-api.dto';
import { InsightTemplateSourceApiDto } from './insight-template-source-api.dto';

export class InsightTemplateResponseApiDto {
  @ApiProperty({ example: 'b1b2c3d4-e5f6-7890-a1b2-c3d4e5f67890' })
  id: string;

  @ApiProperty({ example: 'Summary' })
  title: string;

  @ApiProperty({ example: '### Summary\n{{table source="main"}}', nullable: true })
  template: string | null;

  @ApiProperty({ type: [InsightTemplateSourceApiDto] })
  sources: InsightTemplateSourceApiDto[];

  @ApiProperty({ nullable: true })
  lastRenderedTemplate: string | null;

  @ApiProperty({ nullable: true })
  lastRenderedTemplateUpdatedAt: string | Date | null;

  @ApiProperty({ example: '540734f6-8eb1-48a9-bf86-22010d3bddfd' })
  createdById: string;

  @ApiProperty({ example: '2026-02-14T15:13:06.930Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2026-02-14T15:13:06.930Z' })
  modifiedAt: string | Date;

  @ApiProperty({ nullable: true, type: () => DataMartRunResponseApiDto })
  lastManualDataMartRun: DataMartRunResponseApiDto | null;
}
