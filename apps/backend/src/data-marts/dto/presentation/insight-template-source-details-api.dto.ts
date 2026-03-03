import { ApiProperty } from '@nestjs/swagger';
import { InsightArtifactValidationStatus } from '../../enums/insight-artifact-validation-status.enum';

export class InsightTemplateSourceDetailsApiDto {
  @ApiProperty({ example: '2c8f6b71-7f8f-4e8e-8f31-5f6fd4e2a0f4' })
  templateSourceId: string;

  @ApiProperty({ example: 'projects_2025' })
  key: string;

  @ApiProperty({ example: 'be08ff51-8d9f-4a4f-9751-7fc534835755' })
  artifactId: string;

  @ApiProperty({ example: 'Projects created in 2025' })
  title: string;

  @ApiProperty({
    example: 'SELECT COUNT(*) AS value FROM projects WHERE EXTRACT(YEAR FROM created_at) = 2025',
  })
  sql: string;

  @ApiProperty({ enum: InsightArtifactValidationStatus })
  validationStatus: InsightArtifactValidationStatus;

  @ApiProperty({ required: false, nullable: true, example: null })
  validationError: string | null;

  @ApiProperty({ example: '540734f6-8eb1-48a9-bf86-22010d3bddfd' })
  createdById: string;

  @ApiProperty({ example: '2026-03-03T11:28:33.000Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2026-03-03T11:31:47.000Z' })
  modifiedAt: string | Date;
}
