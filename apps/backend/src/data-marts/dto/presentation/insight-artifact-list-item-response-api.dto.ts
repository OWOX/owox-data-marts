import { ApiProperty } from '@nestjs/swagger';
import { InsightArtifactValidationStatus } from '../../enums/insight-artifact-validation-status.enum';

export class InsightArtifactListItemResponseApiDto {
  @ApiProperty({ example: 'fd6b79dd-72f5-4c8b-aec9-cf12024259d4' })
  id: string;

  @ApiProperty({ example: 'Source' })
  title: string;

  @ApiProperty({ enum: InsightArtifactValidationStatus })
  validationStatus: InsightArtifactValidationStatus;

  @ApiProperty({ required: false, nullable: true, example: null })
  validationError: string | null;

  @ApiProperty({ example: '540734f6-8eb1-48a9-bf86-22010d3bddfd' })
  createdById: string;

  @ApiProperty({ example: '2026-02-14T15:13:06.930Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2026-10-14T15:13:06.930Z' })
  modifiedAt: string | Date;
}
