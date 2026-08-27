import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
  } = {}) => {
    const reportRepository = {
      findOne: jest.fn().mockResolvedValue(found ? report : null),
    };
    const generateHeadersFromSchema = jest.fn().mockResolvedValue(nativeHeaders);
    const compose = jest.fn().mockResolvedValue({ calculatedFields: undefined });
    const service = new GetReportOutputSchemaService(
      reportRepository as never,
      {
        resolveBlendingDecision: jest.fn().mockResolvedValue({ needsBlending: false, ...decision }),
      } as never,
      { compose } as never,
      { canAccess: jest.fn().mockResolvedValue(canSee) } as never,
      { generateHeadersFromSchema } as never
    );
    return { service, reportRepository, generateHeadersFromSchema, compose };
  };

  const command = new GetReportOutputSchemaCommand('report-1', 'user-1', 'project-1', ['admin']);

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
