import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

jest.mock('../../../idp', () => ({
  __esModule: true,
  Auth: () => () => undefined,
  AuthContext: () => () => undefined,
  Role: {
    viewer: jest.fn(),
  },
  Strategy: {
    PARSE: 'parse',
  },
}));

import { ReportController } from '../report.controller';
import { ProjectReportsController } from '../project-reports.controller';
import { CopyReportAsDataMartService } from '../../use-cases/copy-report-as-data-mart.service';
import { CreateReportService } from '../../use-cases/create-report.service';
import { DeleteReportService } from '../../use-cases/delete-report.service';
import { GetReportGeneratedSqlService } from '../../use-cases/get-report-generated-sql.service';
import { GetReportService } from '../../use-cases/get-report.service';
import { ListReportsByDataMartService } from '../../use-cases/list-reports-by-data-mart.service';
import { ListReportsByInsightTemplateService } from '../../use-cases/list-reports-by-insight-template.service';
import { ListReportsByProjectService } from '../../use-cases/list-reports-by-project.service';
import { ReportMapper } from '../../mappers/report.mapper';
import { RunReportService } from '../../use-cases/run-report.service';
import { UpdateReportService } from '../../use-cases/update-report.service';

describe('ReportController OpenAPI', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const providers = [
      CopyReportAsDataMartService,
      CreateReportService,
      DeleteReportService,
      GetReportGeneratedSqlService,
      GetReportService,
      ListReportsByDataMartService,
      ListReportsByInsightTemplateService,
      ListReportsByProjectService,
      ReportMapper,
      RunReportService,
      UpdateReportService,
    ].map(provide => ({ provide, useValue: {} }));

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectReportsController, ReportController],
      providers,
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Test API').setVersion('1.0').build()
    );
  });

  afterAll(async () => {
    await app.close();
  });

  function requestSchema(path: string, method: 'post' | 'put'): Record<string, any> {
    const requestBody = document.paths[path]?.[method]?.requestBody as Record<string, any>;
    const schema = requestBody.content['application/json'].schema as Record<string, any>;
    return schema.$ref ? resolveRef(schema.$ref as string) : schema;
  }

  function resolveRef(ref: string): Record<string, any> {
    const schemaName = ref.split('/').at(-1)!;
    return document.components?.schemas?.[schemaName] as Record<string, any>;
  }

  it('documents required report request fields and optional config fields', () => {
    expect(requestSchema('/api/reports', 'post').required).toEqual([
      'title',
      'dataMartId',
      'dataDestinationId',
      'destinationConfig',
    ]);
    expect(requestSchema('/api/reports/{id}', 'put').required).toEqual([
      'title',
      'dataDestinationId',
      'destinationConfig',
    ]);

    const updateProperties = requestSchema('/api/reports/{id}', 'put').properties;
    expect(updateProperties.destinationConfig.oneOf).toHaveLength(4);
    expect(updateProperties.destinationConfig.oneOf[1]).toMatchObject({
      allOf: [{ $ref: expect.stringContaining('ReportLegacyEmailDestinationConfigApiDto') }],
      not: { required: ['templateSource'] },
    });
    expect(updateProperties.limitConfig).toMatchObject({ type: 'integer', nullable: true });
  });

  it('documents output controls, including slice filter semantics', () => {
    const updateProperties = requestSchema('/api/reports/{id}', 'put').properties;
    const filterRule = resolveRef(updateProperties.filterConfig.items.$ref);
    const sortRule = resolveRef(updateProperties.sortConfig.items.$ref);

    expect(updateProperties.columnConfig).toMatchObject({
      type: 'array',
      nullable: true,
      description: expect.stringContaining('output column names'),
      items: {
        type: 'string',
        minLength: 1,
        description: expect.stringContaining('output column'),
      },
      example: ['date', 'campaign_name', 'spend'],
    });

    expect(updateProperties.filterConfig).toMatchObject({
      type: 'array',
      nullable: true,
      maxItems: 50,
    });
    expect(filterRule.required).toEqual(['column', 'operator']);
    expect(filterRule.properties.operator.enum).toEqual(
      expect.arrayContaining(['eq', 'is_empty', 'between', 'relative_date'])
    );
    expect(filterRule.properties.value.oneOf).toHaveLength(3);
    expect(filterRule.properties.placement.enum).toEqual(['pre-join', 'post-join']);
    expect(filterRule.properties.aliasPath).toBeUndefined();
    expect(filterRule.properties.column.description).toContain('category_details__item_count');
    expect(filterRule.properties.column.description).toContain('hash suffix');

    expect(updateProperties.sortConfig).toMatchObject({
      type: 'array',
      nullable: true,
      maxItems: 10,
      description: expect.stringContaining('Earlier rules take precedence'),
      example: [{ column: 'date', direction: 'desc' }],
    });
    expect(sortRule.required).toEqual(['column', 'direction']);
    expect(sortRule.properties.column.description).toContain('Output column');
    expect(sortRule.properties.direction.enum).toEqual(['asc', 'desc']);

    expect(updateProperties.limitConfig).toMatchObject({
      type: 'integer',
      nullable: true,
      minimum: 1,
      maximum: 10_000_000,
      description: expect.stringContaining('Set null'),
      example: 1000,
    });
  });

  it('documents aggregationConfig in request and response', () => {
    const updateProperties = requestSchema('/api/reports/{id}', 'put').properties;

    expect(updateProperties.aggregationConfig).toMatchObject({
      type: 'array',
      nullable: true,
    });
    expect(updateProperties.aggregationConfig.items.$ref).toContain('ReportAggregationRuleApiDto');

    const aggregationRule = resolveRef(updateProperties.aggregationConfig.items.$ref);
    expect(aggregationRule.required).toEqual(expect.arrayContaining(['column', 'function']));
    expect(aggregationRule.properties.function.enum).toEqual(
      expect.arrayContaining([
        'SUM',
        'AVG',
        'COUNT',
        'COUNT_DISTINCT',
        'MIN',
        'MAX',
        'ANY_VALUE',
        'STRING_AGG',
        'P25',
        'P50',
        'P75',
        'P95',
      ])
    );

    const createProperties = requestSchema('/api/reports', 'post').properties;
    expect(createProperties.aggregationConfig).toMatchObject({
      type: 'array',
      nullable: true,
    });

    // Response side: GET /api/reports/{id} 200 schema must also document aggregationConfig.
    const getResponseSchema = document.paths['/api/reports/{id}']?.get?.responses['200'] as Record<
      string,
      any
    >;
    const getResponseBodySchema = getResponseSchema.content['application/json'].schema as Record<
      string,
      any
    >;
    const responseDto = getResponseBodySchema.$ref
      ? resolveRef(getResponseBodySchema.$ref as string)
      : getResponseBodySchema;
    expect(responseDto.properties.aggregationConfig).toMatchObject({
      type: 'array',
      nullable: true,
    });
  });

  it('documents dateTruncConfig in request and response', () => {
    const updateProperties = requestSchema('/api/reports/{id}', 'put').properties;

    expect(updateProperties.dateTruncConfig).toMatchObject({
      type: 'array',
      nullable: true,
    });
    expect(updateProperties.dateTruncConfig.items.$ref).toContain('ReportDateTruncRuleApiDto');

    const dateTruncRule = resolveRef(updateProperties.dateTruncConfig.items.$ref);
    expect(dateTruncRule.required).toEqual(expect.arrayContaining(['column', 'unit']));
    expect(dateTruncRule.properties.unit.enum).toEqual(
      expect.arrayContaining(['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'])
    );
    // timeZone is an optional string (not in `required`).
    expect(dateTruncRule.properties.timeZone).toMatchObject({ type: 'string' });
    expect(dateTruncRule.required).not.toContain('timeZone');

    const createProperties = requestSchema('/api/reports', 'post').properties;
    expect(createProperties.dateTruncConfig).toMatchObject({
      type: 'array',
      nullable: true,
    });

    const getResponseSchema = document.paths['/api/reports/{id}']?.get?.responses['200'] as Record<
      string,
      any
    >;
    const getResponseBodySchema = getResponseSchema.content['application/json'].schema as Record<
      string,
      any
    >;
    const responseDto = getResponseBodySchema.$ref
      ? resolveRef(getResponseBodySchema.$ref as string)
      : getResponseBodySchema;
    expect(responseDto.properties.dateTruncConfig).toMatchObject({
      type: 'array',
      nullable: true,
    });
  });

  it('documents uniqueCountConfig in request and response', () => {
    const updateProperties = requestSchema('/api/reports/{id}', 'put').properties;
    expect(updateProperties.uniqueCountConfig).toMatchObject({
      type: 'boolean',
      nullable: true,
    });

    const createProperties = requestSchema('/api/reports', 'post').properties;
    expect(createProperties.uniqueCountConfig).toMatchObject({
      type: 'boolean',
      nullable: true,
    });

    const getResponseSchema = document.paths['/api/reports/{id}']?.get?.responses['200'] as Record<
      string,
      any
    >;
    const getResponseBodySchema = getResponseSchema.content['application/json'].schema as Record<
      string,
      any
    >;
    const responseDto = getResponseBodySchema.$ref
      ? resolveRef(getResponseBodySchema.$ref as string)
      : getResponseBodySchema;
    expect(responseDto.properties.uniqueCountConfig).toMatchObject({
      type: 'boolean',
      nullable: true,
    });
  });

  it('documents small object responses', () => {
    expect(document.paths['/api/reports/{id}/generated-sql']?.get?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['sql'],
            properties: { sql: { type: 'string' } },
          },
        },
      },
    });
    expect(
      document.paths['/api/reports/{id}/copy-as-data-mart']?.post?.responses['201']
    ).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['dataMartId'],
            properties: { dataMartId: { type: 'string', format: 'uuid' } },
          },
        },
      },
    });
  });
});
