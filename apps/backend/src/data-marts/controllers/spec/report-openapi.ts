import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { TemplateSourceTypeEnum } from '../../enums/template-source-type.enum';
import { EmailConfigType } from '../../data-destination-types/ee/email/schemas/email-config.schema';
import { ReportCondition } from '../../data-destination-types/enums/report-condition.enum';
import { GoogleSheetsConfigType } from '../../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { LookerStudioConnectorConfigType } from '../../data-destination-types/looker-studio-connector/schemas/looker-studio-connector-config.schema';
import {
  FILTER_NO_VALUE_OPERATORS,
  FILTER_SCALAR_OPERATORS,
} from '../../dto/schemas/filter-config.schema';

const primitiveValueSchema = {
  oneOf: [{ type: 'string' }, { type: 'number' }, { type: 'boolean' }],
};

export class ReportCustomMessageTemplateSourceApiDto {
  @ApiProperty({ enum: [TemplateSourceTypeEnum.CUSTOM_MESSAGE] })
  type: TemplateSourceTypeEnum.CUSTOM_MESSAGE;

  @ApiProperty({
    type: 'object',
    required: ['messageTemplate'],
    properties: { messageTemplate: { type: 'string', minLength: 1 } },
  })
  config: { messageTemplate: string };
}

export class ReportInsightTemplateSourceApiDto {
  @ApiProperty({ enum: [TemplateSourceTypeEnum.INSIGHT_TEMPLATE] })
  type: TemplateSourceTypeEnum.INSIGHT_TEMPLATE;

  @ApiProperty({
    type: 'object',
    required: ['insightTemplateId'],
    properties: { insightTemplateId: { type: 'string', minLength: 1 } },
  })
  config: { insightTemplateId: string };
}

export class ReportEmailDestinationConfigApiDto {
  @ApiProperty({ enum: [EmailConfigType] })
  type: typeof EmailConfigType;

  @ApiProperty({ minLength: 1 })
  subject: string;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(ReportCustomMessageTemplateSourceApiDto) },
      { $ref: getSchemaPath(ReportInsightTemplateSourceApiDto) },
    ],
  })
  templateSource: ReportCustomMessageTemplateSourceApiDto | ReportInsightTemplateSourceApiDto;

  @ApiProperty({ enum: ReportCondition })
  reportCondition: ReportCondition;
}

export class ReportLegacyEmailDestinationConfigApiDto {
  @ApiProperty({ enum: [EmailConfigType] })
  type: typeof EmailConfigType;

  @ApiProperty({ minLength: 1 })
  subject: string;

  @ApiProperty({ minLength: 1 })
  messageTemplate: string;

  @ApiProperty({ enum: ReportCondition })
  reportCondition: ReportCondition;
}

export class ReportGoogleSheetsDestinationConfigApiDto {
  @ApiProperty({ enum: [GoogleSheetsConfigType] })
  type: typeof GoogleSheetsConfigType;

  @ApiProperty({ minLength: 1 })
  spreadsheetId: string;

  @ApiProperty({ minimum: 0 })
  sheetId: number;
}

export class ReportLookerStudioDestinationConfigApiDto {
  @ApiProperty({ enum: [LookerStudioConnectorConfigType] })
  type: typeof LookerStudioConnectorConfigType;

  @ApiProperty({ minimum: 60 })
  cacheLifetime: number;
}

export class ReportBetweenFilterValueApiDto {
  @ApiProperty(primitiveValueSchema)
  from: string | number | boolean;

  @ApiProperty(primitiveValueSchema)
  to: string | number | boolean;
}

export class ReportRelativeDateFilterValueApiDto {
  @ApiProperty({
    enum: [
      'today',
      'yesterday',
      'this_month',
      'last_month',
      'this_year',
      'last_n_days',
      'last_n_months',
    ],
  })
  kind:
    | 'today'
    | 'yesterday'
    | 'this_month'
    | 'last_month'
    | 'this_year'
    | 'last_n_days'
    | 'last_n_months';

  @ApiPropertyOptional({
    description: 'Required when kind is last_n_days or last_n_months.',
    minimum: 1,
    maximum: 3650,
  })
  n?: number;
}

export class ReportFilterRuleApiDto {
  @ApiProperty({
    minLength: 1,
    description:
      'Output column name. For slice filters (placement=pre-join), use the fully qualified blended column identifier, e.g. category_details__item_event_count.',
  })
  column: string;

  @ApiProperty({
    enum: [...FILTER_SCALAR_OPERATORS, ...FILTER_NO_VALUE_OPERATORS, 'between', 'relative_date'],
  })
  operator: string;

  @ApiPropertyOptional({
    description:
      'Required for scalar, between, and relative_date operators. Omit for is_empty/is_null-style operators.',
    oneOf: [
      primitiveValueSchema,
      { $ref: getSchemaPath(ReportBetweenFilterValueApiDto) },
      { $ref: getSchemaPath(ReportRelativeDateFilterValueApiDto) },
    ],
  })
  value?:
    | string
    | number
    | boolean
    | ReportBetweenFilterValueApiDto
    | ReportRelativeDateFilterValueApiDto;

  @ApiPropertyOptional({
    enum: ['pre-join', 'post-join'],
    description: 'Use pre-join for slice filters. Omit for normal output filters.',
  })
  placement?: 'pre-join' | 'post-join';
}

export class ReportSortRuleApiDto {
  @ApiProperty({
    minLength: 1,
    description: 'Output column name to sort by.',
    example: 'date',
  })
  column: string;

  @ApiProperty({
    enum: ['asc', 'desc'],
    description: 'Sort direction for this column.',
  })
  direction: 'asc' | 'desc';
}

export const REPORT_OPENAPI_MODELS = [
  ReportBetweenFilterValueApiDto,
  ReportCustomMessageTemplateSourceApiDto,
  ReportEmailDestinationConfigApiDto,
  ReportFilterRuleApiDto,
  ReportGoogleSheetsDestinationConfigApiDto,
  ReportInsightTemplateSourceApiDto,
  ReportLegacyEmailDestinationConfigApiDto,
  ReportLookerStudioDestinationConfigApiDto,
  ReportRelativeDateFilterValueApiDto,
  ReportSortRuleApiDto,
];

const destinationConfigRequestProperty = {
  description: 'Configuration for the selected data destination.',
  oneOf: [
    { $ref: getSchemaPath(ReportEmailDestinationConfigApiDto) },
    {
      allOf: [{ $ref: getSchemaPath(ReportLegacyEmailDestinationConfigApiDto) }],
      not: { required: ['templateSource'] },
    },
    { $ref: getSchemaPath(ReportGoogleSheetsDestinationConfigApiDto) },
    { $ref: getSchemaPath(ReportLookerStudioDestinationConfigApiDto) },
  ],
};

const commonReportRequestProperties = {
  title: { type: 'string', example: 'My Report' },
  dataDestinationId: { type: 'string', description: 'ID of the data destination' },
  destinationConfig: destinationConfigRequestProperty,
  ownerIds: {
    type: 'array',
    items: { type: 'string' },
    maxItems: 100,
  },
  columnConfig: {
    type: 'array',
    nullable: true,
    items: {
      type: 'string',
      minLength: 1,
      description: 'Selected output column name.',
    },
    description: 'Ordered selected output column names. Set null to include all native columns.',
    example: ['date', 'campaign_name', 'spend'],
  },
  filterConfig: {
    type: 'array',
    nullable: true,
    maxItems: 50,
    items: { $ref: getSchemaPath(ReportFilterRuleApiDto) },
    description:
      'Output filters. Use placement=pre-join for slice filters (column = unified blended identifier).',
  },
  sortConfig: {
    type: 'array',
    nullable: true,
    maxItems: 10,
    items: { $ref: getSchemaPath(ReportSortRuleApiDto) },
    description: 'Ordered sort rules. Earlier rules take precedence.',
    example: [{ column: 'date', direction: 'desc' }],
  },
  limitConfig: {
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: 10_000_000,
    description: 'Maximum number of rows to return. Set null to return without an explicit cap.',
    example: 1000,
  },
};

export const createReportRequestBodySchema = {
  type: 'object',
  required: ['title', 'dataMartId', 'dataDestinationId', 'destinationConfig'],
  properties: {
    title: commonReportRequestProperties.title,
    dataMartId: { type: 'string', description: 'ID of the data mart' },
    dataDestinationId: commonReportRequestProperties.dataDestinationId,
    destinationConfig: commonReportRequestProperties.destinationConfig,
    ownerIds: commonReportRequestProperties.ownerIds,
    columnConfig: commonReportRequestProperties.columnConfig,
    filterConfig: commonReportRequestProperties.filterConfig,
    sortConfig: commonReportRequestProperties.sortConfig,
    limitConfig: commonReportRequestProperties.limitConfig,
  },
};

export const updateReportRequestBodySchema = {
  type: 'object',
  required: ['title', 'dataDestinationId', 'destinationConfig'],
  properties: commonReportRequestProperties,
};
