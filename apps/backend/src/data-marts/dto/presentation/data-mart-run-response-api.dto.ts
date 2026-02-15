import { ApiProperty } from '@nestjs/swagger';
import { RunType } from '../../../common/scheduler/shared/types';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartRunReportDefinition } from '../schemas/data-mart-run/data-mart-run-report-definition.schema';
import { DataMartRunInsightDefinition } from '../schemas/data-mart-run/data-mart-run-insight-definition.schema';
import { DataMartRunInsightTemplateDefinition } from '../schemas/data-mart-run/data-mart-run-insight-template-definition.schema';

export class DataMartRunResponseApiDto {
  @ApiProperty({ example: '0b0f5a1e-6f66-4a7d-8b8d-123456789abc' })
  id: string;

  @ApiProperty({
    example: 'SUCCESS',
    description: 'Final status of the run',
    enum: DataMartRunStatus,
    enumName: 'DataMartRunStatus',
  })
  status: DataMartRunStatus;

  @ApiProperty({
    example: 'CONNECTOR',
    description: 'Run type (connector, report, insight)',
    enum: DataMartRunType,
    enumName: 'DataMartRunType',
  })
  type: DataMartRunType;

  @ApiProperty({
    example: 'manual',
    description: 'Run trigger type (manual, scheduled)',
    enum: RunType,
    enumName: 'RunType',
  })
  runType: RunType;

  @ApiProperty({ example: 'a5c9b1d2-3456-7890-abcd-ef0123456789' })
  dataMartId: string;

  @ApiProperty({
    example: { connector: { source: { name: 'Example' } } },
    description: 'Masked definition snapshot at run time',
    required: false,
    nullable: true,
  })
  definitionRun: DataMartDefinition | null;

  @ApiProperty({
    example: '44c7b3e4-5d6f-7a8b-9c0d-112233445566',
    required: false,
    nullable: true,
  })
  reportId: string | null;

  @ApiProperty({
    example: { title: 'Quarterly export', destination: { type: 'GOOGLE_SHEETS' } },
    required: false,
    nullable: true,
  })
  reportDefinition: DataMartRunReportDefinition | null;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
    required: false,
    nullable: true,
  })
  insightId: string | null;

  @ApiProperty({
    example: { title: 'Analysis Q4 2025', template: 'Template text with prompts' },
    required: false,
    nullable: true,
  })
  insightDefinition: DataMartRunInsightDefinition | null;

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
    required: false,
    nullable: true,
  })
  insightTemplateId: string | null;

  @ApiProperty({
    example: {
      title: 'Summary',
      template: '### Summary\\n{{table source="main"}}',
      sources: [{ key: 'main', type: 'CURRENT_DATA_MART' }],
    },
    required: false,
    nullable: true,
  })
  insightTemplateDefinition: DataMartRunInsightTemplateDefinition | null;

  @ApiProperty({
    example: ['{"type":"log","at":"2025-10-09T15:13:06.930Z","message":"Started"}'],
    required: false,
    nullable: true,
  })
  logs: string[] | null;

  @ApiProperty({
    example: ['{"type":"error","at":"2025-10-09T15:14:06.930Z","error":"Failure"}'],
    required: false,
    nullable: true,
  })
  errors: string[] | null;

  @ApiProperty({ example: '2025-10-09T15:13:06.930Z' })
  createdAt: string | Date;

  @ApiProperty({ example: '2025-10-09T15:14:06.930Z', required: false, nullable: true })
  startedAt: string | Date | null;

  @ApiProperty({ example: '2025-10-09T15:20:06.930Z', required: false, nullable: true })
  finishedAt: string | Date | null;
}
