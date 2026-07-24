import { ApiProperty } from '@nestjs/swagger';
import { RunType } from '../../../common/scheduler/shared/types';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { DataMartDefinition } from '../schemas/data-mart-table-definitions/data-mart-definition';
import { DataMartRunReportDefinition } from '../schemas/data-mart-run/data-mart-run-report-definition.schema';
import { DataMartRunInsightDefinition } from '../schemas/data-mart-run/data-mart-run-insight-definition.schema';
import { DataMartRunInsightTemplateDefinition } from '../schemas/data-mart-run/data-mart-run-insight-template-definition.schema';
import { DataMartRunAiSourceDefinition } from '../schemas/data-mart-run/data-mart-run-ai-source-definition.schema';

export type DataMartRunAiSourceResponseDefinition = Omit<DataMartRunAiSourceDefinition, 'trace'>;
export type DataMartRunTotals = Record<string, number | string | boolean | null> | null;

export function DataMartRunTotalsApiProperty(required = false) {
  return ApiProperty({
    type: Object,
    additionalProperties: {
      oneOf: [
        { type: 'number' },
        { type: 'string' },
        { type: 'boolean' },
        { type: 'string', nullable: true, enum: [null] },
      ],
    },
    example: {
      'revenue | SUM': 1575.93,
      'revenue | AVG': 157.593,
      'country | COUNTUNIQUE': 18,
    },
    description:
      'Grand-totals summary over the full filtered dataset (no grouping): every selected numeric ' +
      'field, plus any non-numeric field the report aggregates as a metric (e.g. COUNT_DISTINCT ' +
      'over a text column), each by its allowed aggregation functions. Covers native and joined ' +
      'fields. ANY_VALUE and STRING_AGG are excluded (not meaningful as a grand total). Null when ' +
      'the run produced no totals.',
    required,
    nullable: true,
  });
}

export class DataMartRunResponseApiDto {
  @ApiProperty({ example: '0b0f5a1e-6f66-4a7d-8b8d-123456789abc' })
  id: string;

  @ApiProperty({
    example: 'SUCCESS',
    description: 'Current run lifecycle status.',
    enum: DataMartRunStatus,
    enumName: 'DataMartRunStatus',
  })
  status: DataMartRunStatus;

  @ApiProperty({
    example: 'CONNECTOR',
    description: 'Execution category that produced the run.',
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
    type: Object,
    additionalProperties: true,
    example: { connector: { source: { name: 'Example' } } },
    description:
      'Masked definition snapshot at run time. Null when a historical snapshot is unavailable.',
    nullable: true,
  })
  definitionRun: DataMartDefinition | null;

  @ApiProperty({
    type: String,
    example: '44c7b3e4-5d6f-7a8b-9c0d-112233445566',
    nullable: true,
  })
  reportId: string | null;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    example: {
      title: 'Quarterly export',
      destination: { type: 'GOOGLE_SHEETS' },
      executionSqlQuery:
        "SELECT * FROM (SELECT * FROM `proj.ds.sales`) WHERE created_at >= DATE '2025-01-01'",
    },
    nullable: true,
  })
  reportDefinition: DataMartRunReportDefinition | null;

  @ApiProperty({
    type: String,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
    nullable: true,
  })
  insightId: string | null;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    example: { title: 'Analysis Q4 2025', template: 'Template text with prompts' },
    nullable: true,
  })
  insightDefinition: DataMartRunInsightDefinition | null;

  @ApiProperty({
    type: String,
    example: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
    nullable: true,
  })
  insightTemplateId: string | null;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    example: {
      title: 'Summary',
      template: '### Summary\\n{{table source="main"}}',
      sources: [{ key: 'main', type: 'CURRENT_DATA_MART', kind: 'TABLE' }],
    },
    nullable: true,
  })
  insightTemplateDefinition: DataMartRunInsightTemplateDefinition | null;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    example: {
      sessionId: 'e7f7e087-2042-4de0-b1fc-67dddbaf88dd',
      scope: 'template',
      route: 'full_generation',
      templateId: '6f093b03-30c1-43e0-b9ed-6d87d33edf15',
      artifactId: null,
      turnId: '6742f3e8-1a02-4642-bbf4-e7f8710f9507',
    },
    nullable: true,
  })
  aiSourceDefinition: DataMartRunAiSourceResponseDefinition | null;

  @ApiProperty({
    type: [String],
    example: ['{"type":"log","at":"2025-10-09T15:13:06.930Z","message":"Started"}'],
    nullable: true,
  })
  logs: string[] | null;

  @ApiProperty({
    type: [String],
    example: ['{"type":"error","at":"2025-10-09T15:14:06.930Z","error":"Failure"}'],
    nullable: true,
  })
  errors: string[] | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2025-10-09T15:13:06.930Z',
    description: 'RFC3339 timestamp when the run record was created.',
  })
  createdAt: string | Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2025-10-09T15:14:06.930Z',
    description: 'RFC3339 timestamp when execution started, or null when it has not started.',
    nullable: true,
  })
  startedAt: string | Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2025-10-09T15:20:06.930Z',
    description: 'RFC3339 timestamp when execution finished, or null while unfinished.',
    nullable: true,
  })
  finishedAt: string | Date | null;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    example: { httpData: { format: 'ndjson', columns: ['date'], rowCount: 10, completed: true } },
    description:
      'Run-type-specific metadata captured by the use case (e.g. `httpData` for HTTP Data API runs)',
    nullable: true,
  })
  additionalParams: Record<string, unknown> | null;

  @DataMartRunTotalsApiProperty()
  totals: DataMartRunTotals;
}
