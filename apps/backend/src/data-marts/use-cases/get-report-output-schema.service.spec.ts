import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { GetReportOutputSchemaCommand } from '../dto/domain/get-report-output-schema.command';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { GetReportOutputSchemaService } from './get-report-output-schema.service';

describe('GetReportOutputSchemaService', () => {
  const schema = { fields: [] };
  const report = {
    id: 'report-1',
    dataMart: { id: 'dm-1', storage: { id: 'storage-1', type: 'BIGQUERY' }, schema },
    dataDestination: { id: 'dest-1' },
    aggregationConfig: null,
    uniqueCountConfig: null,
  };

  const createService = ({
    canSee = true,
    found = true,
    nativeHeaders = [] as ReportDataHeader[],
    decision = {} as Record<string, unknown>,
    reportOverrides = {} as Record<string, unknown>,
  } = {}) => {
    const reportRepository = {
      findOne: jest.fn().mockResolvedValue(found ? { ...report, ...reportOverrides } : null),
    };
    const generateHeadersFromSchema = jest.fn().mockResolvedValue(nativeHeaders);
    const resolveBlendingDecision = jest
      .fn()
      .mockResolvedValue({ needsBlending: false, ...decision });
    const service = new GetReportOutputSchemaService(
      reportRepository as never,
      { resolveBlendingDecision } as never,
      { canAccess: jest.fn().mockResolvedValue(canSee) } as never,
      { generateHeadersFromSchema } as never
    );
    return {
      service,
      reportRepository,
      generateHeadersFromSchema,
      resolveBlendingDecision,
    };
  };

  const command = new GetReportOutputSchemaCommand('report-1', 'user-1', 'project-1', ['admin']);

  // `integerTypeFor` refuses an unrecognized storage type, so anything synthesising a Unique Count
  // header needs a real one rather than the bare 'BIGQUERY' the base fixture carries.
  const onBigQuery = {
    dataMart: {
      ...report.dataMart,
      storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
    },
  };

  it('names the columns a report synthesises, which no schema field describes', async () => {
    const { service, generateHeadersFromSchema } = createService({
      nativeHeaders: [
        new ReportDataHeader('date', 'Date', 'Reporting day', BigQueryFieldType.DATE),
        new ReportDataHeader('revenue', 'Revenue, $', undefined, BigQueryFieldType.NUMERIC),
        new ReportDataHeader('clicks'),
      ],
      decision: {
        columnFilter: ['date', 'revenue', 'clicks'],
        aggregations: [{ column: 'revenue', function: 'SUM' }],
      },
    });

    await expect(service.run(command)).resolves.toEqual([
      expect.objectContaining({
        name: 'date',
        alias: 'Date',
        description: 'Reporting day',
        storageFieldType: BigQueryFieldType.DATE,
      }),
      expect.objectContaining({
        name: 'revenue | SUM',
        alias: 'Revenue, $ | SUM',
        storageFieldType: BigQueryFieldType.NUMERIC,
      }),
      expect.objectContaining({ name: 'clicks' }),
    ]);

    expect(generateHeadersFromSchema).toHaveBeenCalledWith('BIGQUERY', schema);
  });

  it('describes the output from the stored schema, without a storage reader', async () => {
    const { service, generateHeadersFromSchema, reportRepository } = createService();

    await service.run(command);

    expect(generateHeadersFromSchema).toHaveBeenCalledTimes(1);
    expect(reportRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        relations: ['dataMart', 'dataMart.storage', 'dataDestination'],
      })
    );
  });

  // Cross-project isolation lives in the QUERY, not in a later check: a report id belonging to
  // another project must not resolve at all, so the caller cannot tell it apart from one that does
  // not exist. Asserted explicitly because the repository is mocked here — dropping the projectId
  // clause would otherwise pass every other test in this file.
  it('looks the report up only within the caller project', async () => {
    const { service, reportRepository } = createService();

    await service.run(command);

    expect(reportRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'report-1', dataMart: { projectId: 'project-1' } },
      })
    );
  });

  // The plans come off the decision on BOTH paths, so naming a report's columns never parses a
  // formula twice and never calls `compose()` — which would refresh a SQL Data Mart's view.
  it('takes calculated-field plans from the decision on the non-blended path', async () => {
    const plans = [{ outputName: 'ctr', type: 'FLOAT', formula: 'clicks / impressions' }];
    const { service } = createService({
      reportOverrides: { limitConfig: 100 },
      nativeHeaders: [new ReportDataHeader('clicks')],
      decision: { columnFilter: ['clicks', 'ctr'], calculatedFields: plans },
    });

    await expect(service.run(command)).resolves.toEqual([
      expect.objectContaining({ name: 'clicks' }),
      expect.objectContaining({ name: 'ctr' }),
    ]);
  });

  // The blended branch: joined headers and calculated fields have no Data Mart schema field behind
  // them, so the decision is their only source. Order is pinned too — a calculated field stripped
  // out of `columnFilter` lands AFTER the joined Unique Count, not at the position it was selected.
  it('describes a blended report from the decision: joined columns, Unique Count sources, metrics', async () => {
    const { service } = createService({
      reportOverrides: onBigQuery,
      nativeHeaders: [
        new ReportDataHeader('date', 'Date', 'Reporting day', BigQueryFieldType.DATE),
      ],
      decision: {
        needsBlending: true,
        columnFilter: ['date', 'orders_amount', 'ctr'],
        blendedDataHeaders: [
          new ReportDataHeader(
            'orders_amount',
            'Amount (Orders)',
            undefined,
            BigQueryFieldType.NUMERIC
          ),
        ],
        uniqueCountSources: [
          { outputLabel: 'orders__unique_count', displayLabel: 'Unique Count (Orders)' },
        ],
        calculatedFields: [
          {
            outputName: 'ctr',
            type: 'FLOAT',
            formula: 'clicks / impressions',
            level: 'metric',
            alias: 'CTR, %',
          },
        ],
      },
    });

    await expect(service.run(command)).resolves.toEqual([
      expect.objectContaining({ name: 'date', alias: 'Date' }),
      expect.objectContaining({ name: 'orders_amount', alias: 'Amount (Orders)' }),
      expect.objectContaining({
        name: 'orders__unique_count',
        alias: 'Unique Count (Orders)',
        storageFieldType: BigQueryFieldType.INTEGER,
      }),
      expect.objectContaining({ name: 'ctr', alias: 'CTR, %' }),
    ]);
  });

  it('publishes the main Unique Count column, which the Data Mart schema does not carry', async () => {
    const { service } = createService({
      reportOverrides: { ...onBigQuery, uniqueCountConfig: true },
      nativeHeaders: [new ReportDataHeader('date', 'Date', undefined, BigQueryFieldType.DATE)],
      decision: { columnFilter: ['date'], primaryKeyColumns: ['id'] },
    });

    await expect(service.run(command)).resolves.toEqual([
      expect.objectContaining({ name: 'date' }),
      expect.objectContaining({
        name: 'Unique Count',
        storageFieldType: BigQueryFieldType.INTEGER,
        aggregateFunction: 'COUNT_DISTINCT',
      }),
    ]);
  });

  // The order matters, not just the exception: the blending decision refreshes a SQL-defined
  // source's view on the joined path, so a request that can only fail must not reach it.
  it('refuses a Data Mart whose schema was never stored, before resolving any blending', async () => {
    const { service, generateHeadersFromSchema, resolveBlendingDecision } = createService({
      reportOverrides: { dataMart: { ...report.dataMart, schema: undefined } },
    });

    await expect(service.run(command)).rejects.toBeInstanceOf(BusinessViolationException);
    expect(resolveBlendingDecision).not.toHaveBeenCalled();
    expect(generateHeadersFromSchema).not.toHaveBeenCalled();
  });

  it('refuses a caller who cannot see the source data mart', async () => {
    const { service, generateHeadersFromSchema } = createService({ canSee: false });

    await expect(service.run(command)).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateHeadersFromSchema).not.toHaveBeenCalled();
  });

  it('reports a report that is not there', async () => {
    const { service, generateHeadersFromSchema } = createService({ found: false });

    await expect(service.run(command)).rejects.toBeInstanceOf(NotFoundException);
    expect(generateHeadersFromSchema).not.toHaveBeenCalled();
  });

  it('requires an authenticated user', async () => {
    const { service, generateHeadersFromSchema } = createService();
    const anonymous = new GetReportOutputSchemaCommand('report-1', '', 'project-1', []);

    await expect(service.run(anonymous)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(generateHeadersFromSchema).not.toHaveBeenCalled();
  });
});
