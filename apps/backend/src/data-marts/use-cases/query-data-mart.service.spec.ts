import { NotFoundException } from '@nestjs/common';
import { QueryDataMartCommand, QueryDataMartService } from './query-data-mart.service';
import { ProjectOperationBlockedException } from '../../common/exceptions/project-operation-blocked.exception';
import { ProjectBlockedReason } from '../enums/project-blocked-reason.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { ReportDataBatch } from '../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';

describe('QueryDataMartService', () => {
  const dataMart = {
    id: 'dm1',
    projectId: 'p1',
    storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY },
  };

  const createService = (
    overrides: {
      dataHeaders?: ReportDataHeader[];
      batches?: ReportDataBatch[];
      accessAllowed?: boolean;
      balanceAllowed?: boolean;
    } = {}
  ) => {
    const dataHeaders = overrides.dataHeaders ?? [
      new ReportDataHeader('channel', 'channel'),
      new ReportDataHeader('revenue', 'revenue'),
    ];
    const batches = overrides.batches ?? [
      new ReportDataBatch(
        [
          ['fb', 10],
          ['org', 8],
        ],
        null
      ),
    ];

    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
    };
    const composer = {
      compose: jest.fn().mockResolvedValue({ sql: 'SELECT 1', params: [] }),
      inlineStaticSql: jest.fn((_storageType: unknown, sql: string) => sql),
    };
    const reader = {
      prepareReportData: jest.fn().mockResolvedValue(new ReportDataDescription(dataHeaders)),
      readReportDataBatch: jest.fn(),
      finalize: jest.fn().mockResolvedValue(undefined),
    };
    let call = 0;
    reader.readReportDataBatch.mockImplementation(() =>
      Promise.resolve(batches[call++] ?? new ReportDataBatch([], null))
    );
    const readerResolver = {
      resolve: jest.fn().mockResolvedValue(reader),
    };
    const reportTotalsService = {
      computeTotals: jest.fn().mockResolvedValue(null),
    };
    const dataMartRunService = {
      recordMcpQueryRun: jest.fn().mockResolvedValue(undefined),
    };
    // Default: access is allowed. Override with accessAllowed: false to test denial.
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(overrides.accessAllowed ?? true),
    };
    // Default: balance check passes. Pass balanceAllowed: false to simulate blocked project.
    const projectBalanceService = {
      verifyCanPerformOperations:
        overrides.balanceAllowed === false
          ? jest
              .fn()
              .mockRejectedValue(
                new ProjectOperationBlockedException([
                  ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED,
                ])
              )
          : jest.fn().mockResolvedValue(undefined),
    };
    const consumptionTrackingService = {
      registerMcpQueryRunConsumption: jest.fn().mockResolvedValue(undefined),
    };

    const service = new QueryDataMartService(
      dataMartService as never,
      composer as never,
      readerResolver as never,
      reportTotalsService as never,
      dataMartRunService as never,
      accessDecisionService as never,
      projectBalanceService as never,
      consumptionTrackingService as never
    );

    return {
      service,
      dataMartService,
      composer,
      reader,
      readerResolver,
      reportTotalsService,
      dataMartRunService,
      accessDecisionService,
      projectBalanceService,
      consumptionTrackingService,
    };
  };

  beforeEach(() => jest.clearAllMocks());

  it('reads rows for a non-aggregated single-DM query', async () => {
    const { service, dataMartService, composer, reader } = createService();

    const result = await service.run(
      new QueryDataMartCommand({
        projectId: 'p1',
        userId: 'u1',
        roles: ['admin'],
        dataMartId: 'dm1',
        fields: ['channel', 'revenue'],
        limit: 100,
      })
    );

    expect(result.columns).toEqual(['channel', 'revenue']);
    expect(result.rows).toEqual([
      ['fb', 10],
      ['org', 8],
    ]);
    expect(result.truncated).toBe(false);
    expect(result.totals).toBeNull();

    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm1', 'p1');
    // SQL is composed from the read plan, then handed to the reader as an override.
    expect(composer.compose).toHaveBeenCalledTimes(1);
    expect(reader.prepareReportData).toHaveBeenCalledWith(
      expect.objectContaining({ dataMart, columnConfig: ['channel', 'revenue'] }),
      expect.objectContaining({
        sqlOverride: 'SELECT 1',
        sqlOverrideParams: [],
        columnFilter: ['channel', 'revenue'],
      })
    );
    expect(reader.finalize).toHaveBeenCalledTimes(1);
  });

  it('marks the result truncated when the reader returns more than the limit', async () => {
    const { service } = createService({
      batches: [
        new ReportDataBatch(
          [
            ['fb', 10],
            ['org', 8],
            ['paid', 5],
          ],
          null
        ),
      ],
    });

    const result = await service.run(
      new QueryDataMartCommand({
        projectId: 'p1',
        userId: 'u1',
        roles: ['admin'],
        dataMartId: 'dm1',
        fields: ['channel', 'revenue'],
        limit: 2,
      })
    );

    expect(result.rows).toEqual([
      ['fb', 10],
      ['org', 8],
    ]);
    expect(result.truncated).toBe(true);
  });

  it('finalizes the reader even when reading fails', async () => {
    const { service, reader } = createService();
    reader.readReportDataBatch.mockRejectedValue(new Error('read boom'));

    await expect(
      service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel'],
          limit: 100,
        })
      )
    ).rejects.toThrow('read boom');

    expect(reader.finalize).toHaveBeenCalledTimes(1);
  });

  it('does not fail an already-successful, already-recorded query when finalize() rejects', async () => {
    const { service, reader, dataMartRunService } = createService();
    reader.finalize.mockRejectedValue(new Error('finalize boom'));

    const result = await service.run(
      new QueryDataMartCommand({
        projectId: 'p1',
        userId: 'u1',
        roles: ['admin'],
        dataMartId: 'dm1',
        fields: ['channel', 'revenue'],
        limit: 100,
      })
    );

    expect(result.rows).toHaveLength(2);
    expect(reader.finalize).toHaveBeenCalledTimes(1);
    const call = dataMartRunService.recordMcpQueryRun.mock.calls[0][0];
    expect(call.status).toBe(DataMartRunStatus.SUCCESS);
  });

  it('computes and returns totals via ReportTotalsService', async () => {
    const mockTotals = { 'revenue | SUM': 18 };
    const reportTotalsService = {
      computeTotals: jest.fn().mockResolvedValue(mockTotals),
    };

    const service = new QueryDataMartService(
      { getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart) } as never,
      {
        compose: jest.fn().mockResolvedValue({ sql: 'SELECT 1', params: [] }),
        inlineStaticSql: jest.fn((_st: unknown, sql: string) => sql),
      } as never,
      {
        resolve: jest.fn().mockResolvedValue({
          prepareReportData: jest
            .fn()
            .mockResolvedValue(
              new ReportDataDescription([
                new ReportDataHeader('channel', 'channel'),
                new ReportDataHeader('revenue', 'revenue'),
              ])
            ),
          readReportDataBatch: jest.fn().mockResolvedValue(
            new ReportDataBatch(
              [
                ['fb', 10],
                ['org', 8],
              ],
              null
            )
          ),
          finalize: jest.fn().mockResolvedValue(undefined),
        }),
      } as never,
      reportTotalsService as never,
      { recordMcpQueryRun: jest.fn().mockResolvedValue(undefined) } as never,
      { canAccess: jest.fn().mockResolvedValue(true) } as never,
      { verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined) } as never,
      { registerMcpQueryRunConsumption: jest.fn().mockResolvedValue(undefined) } as never
    );

    const result = await service.run(
      new QueryDataMartCommand({
        projectId: 'p1',
        userId: 'u1',
        roles: ['admin'],
        dataMartId: 'dm1',
        fields: ['channel', 'revenue'],
        limit: 100,
      })
    );

    expect(result.totals).toEqual(mockTotals);
    expect(reportTotalsService.computeTotals).toHaveBeenCalledTimes(1);
  });

  describe('Run History recording', () => {
    it('records a SUCCESS run with correct metadata after a successful query', async () => {
      const { service, dataMartRunService } = createService();

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 100,
          filterConfig: [{ column: 'channel', operator: 'eq', value: 'fb' }] as never,
          aggregationConfig: [{ column: 'revenue', function: 'SUM' as never }] as never,
        })
      );

      expect(dataMartRunService.recordMcpQueryRun).toHaveBeenCalledTimes(1);
      const call = dataMartRunService.recordMcpQueryRun.mock.calls[0][0];
      expect(call.status).toBe(DataMartRunStatus.SUCCESS);
      expect(call.createdById).toBe('u1');
      expect(call.dataMart).toEqual(dataMart);
      expect(call.metadata).toEqual(
        expect.objectContaining({
          columns: ['channel', 'revenue'],
          rowCount: 2,
          truncated: false,
          executionSqlQuery: 'SELECT 1',
          filterCount: 1,
          aggregationCount: 1,
        })
      );
      expect(typeof call.runId).toBe('string');
      expect(call.runId).toHaveLength(36); // UUID v4
      expect(call.startedAt).toBeInstanceOf(Date);
    });

    it('records a SUCCESS run with truncated=true when rows exceed limit', async () => {
      const { service, dataMartRunService } = createService({
        batches: [
          new ReportDataBatch(
            [
              ['fb', 10],
              ['org', 8],
              ['paid', 5],
            ],
            null
          ),
        ],
      });

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 2,
        })
      );

      expect(dataMartRunService.recordMcpQueryRun).toHaveBeenCalledTimes(1);
      const call = dataMartRunService.recordMcpQueryRun.mock.calls[0][0];
      expect(call.status).toBe(DataMartRunStatus.SUCCESS);
      expect(call.metadata.truncated).toBe(true);
      expect(call.metadata.rowCount).toBe(2);
    });

    it('records a FAILED run and rethrows when reading throws', async () => {
      const { service, reader, dataMartRunService } = createService();
      reader.readReportDataBatch.mockRejectedValue(new Error('read boom'));

      await expect(
        service.run(
          new QueryDataMartCommand({
            projectId: 'p1',
            userId: 'u1',
            roles: ['admin'],
            dataMartId: 'dm1',
            fields: ['channel'],
            limit: 100,
          })
        )
      ).rejects.toThrow('read boom');

      expect(dataMartRunService.recordMcpQueryRun).toHaveBeenCalledTimes(1);
      const call = dataMartRunService.recordMcpQueryRun.mock.calls[0][0];
      expect(call.status).toBe(DataMartRunStatus.FAILED);
      expect(call.errors).toContain('read boom');
      expect(call.metadata.columns).toEqual([]);
      expect(call.metadata.rowCount).toBe(0);
      expect(call.metadata.truncated).toBe(false);
    });

    it('records a FAILED run and rethrows when compose throws (compose-time reject, e.g. unknown field)', async () => {
      const { service, composer, reader, dataMartRunService, readerResolver } = createService();
      composer.compose.mockRejectedValue(new Error('unknown column: nope_field'));

      await expect(
        service.run(
          new QueryDataMartCommand({
            projectId: 'p1',
            userId: 'u1',
            roles: ['admin'],
            dataMartId: 'dm1',
            fields: ['nope_field'],
            limit: 100,
          })
        )
      ).rejects.toThrow('unknown column: nope_field');

      expect(dataMartRunService.recordMcpQueryRun).toHaveBeenCalledTimes(1);
      const call = dataMartRunService.recordMcpQueryRun.mock.calls[0][0];
      expect(call.status).toBe(DataMartRunStatus.FAILED);
      expect(call.errors).toContain('unknown column: nope_field');
      expect(readerResolver.resolve).not.toHaveBeenCalled();
      expect(reader.finalize).not.toHaveBeenCalled();
    });

    it('includes query payload in SUCCESS run metadata', async () => {
      const { service, dataMartRunService } = createService();

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 50,
          filterConfig: [{ column: 'channel', operator: 'eq', value: 'fb' }] as never,
          aggregationConfig: [{ column: 'revenue', function: 'SUM' as never }] as never,
          dateTruncConfig: [{ column: 'date', unit: 'MONTH' }] as never,
        })
      );

      const call = dataMartRunService.recordMcpQueryRun.mock.calls[0][0];
      expect(call.status).toBe(DataMartRunStatus.SUCCESS);
      expect(call.metadata.query).toEqual({
        fields: ['channel', 'revenue'],
        filters: [{ column: 'channel', operator: 'eq', value: 'fb' }],
        aggregations: [{ column: 'revenue', function: 'SUM' }],
        dateBuckets: [{ column: 'date', unit: 'MONTH' }],
        limit: 50,
      });
    });

    it('includes query payload in SUCCESS run metadata without optional keys when not provided', async () => {
      const { service, dataMartRunService } = createService();

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel'],
          limit: 100,
        })
      );

      const call = dataMartRunService.recordMcpQueryRun.mock.calls[0][0];
      expect(call.status).toBe(DataMartRunStatus.SUCCESS);
      expect(call.metadata.query).toEqual({ fields: ['channel'], limit: 100 });
      expect(call.metadata.query).not.toHaveProperty('filters');
      expect(call.metadata.query).not.toHaveProperty('aggregations');
      expect(call.metadata.query).not.toHaveProperty('dateBuckets');
    });

    it('includes query payload in FAILED run metadata', async () => {
      const { service, reader, dataMartRunService } = createService();
      reader.readReportDataBatch.mockRejectedValue(new Error('read boom'));

      await expect(
        service.run(
          new QueryDataMartCommand({
            projectId: 'p1',
            userId: 'u1',
            roles: ['admin'],
            dataMartId: 'dm1',
            fields: ['channel'],
            limit: 100,
            filterConfig: [{ column: 'channel', operator: 'eq', value: 'paid' }] as never,
          })
        )
      ).rejects.toThrow('read boom');

      const call = dataMartRunService.recordMcpQueryRun.mock.calls[0][0];
      expect(call.status).toBe(DataMartRunStatus.FAILED);
      expect(call.metadata.query).toEqual({
        fields: ['channel'],
        filters: [{ column: 'channel', operator: 'eq', value: 'paid' }],
        limit: 100,
      });
    });

    it('does not include row values in run metadata', async () => {
      const { service, dataMartRunService } = createService();

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 100,
        })
      );

      const call = dataMartRunService.recordMcpQueryRun.mock.calls[0][0];
      expect(call.metadata).not.toHaveProperty('rows');
      expect(call.metadata).not.toHaveProperty('data');
    });
  });

  it('returns totals even for non-aggregated queries', async () => {
    const mockTotals = { 'revenue | SUM': 18 };
    const reportTotalsService = {
      computeTotals: jest.fn().mockResolvedValue(mockTotals),
    };

    const readerMock = {
      prepareReportData: jest
        .fn()
        .mockResolvedValue(new ReportDataDescription([new ReportDataHeader('channel', 'channel')])),
      readReportDataBatch: jest
        .fn()
        .mockResolvedValue(new ReportDataBatch([['fb'], ['org']], null)),
      finalize: jest.fn().mockResolvedValue(undefined),
    };

    const service = new QueryDataMartService(
      { getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart) } as never,
      {
        compose: jest.fn().mockResolvedValue({ sql: 'SELECT 1', params: [] }),
        inlineStaticSql: jest.fn((_st: unknown, sql: string) => sql),
      } as never,
      { resolve: jest.fn().mockResolvedValue(readerMock) } as never,
      reportTotalsService as never,
      { recordMcpQueryRun: jest.fn().mockResolvedValue(undefined) } as never,
      { canAccess: jest.fn().mockResolvedValue(true) } as never,
      { verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined) } as never,
      { registerMcpQueryRunConsumption: jest.fn().mockResolvedValue(undefined) } as never
    );

    const result = await service.run(
      new QueryDataMartCommand({
        projectId: 'p1',
        userId: 'u1',
        roles: ['admin'],
        dataMartId: 'dm1',
        fields: ['channel'],
        limit: 100,
      })
    );

    expect(result.totals).toEqual(mockTotals);
    expect(reportTotalsService.computeTotals).toHaveBeenCalledTimes(1);
  });

  describe('per-user DM access (FIX 1)', () => {
    it('throws NotFoundException when accessDecisionService.canAccess returns false', async () => {
      const { service } = createService({ accessAllowed: false });

      await expect(
        service.run(
          new QueryDataMartCommand({
            projectId: 'p1',
            userId: 'u1',
            roles: ['viewer'],
            dataMartId: 'dm1',
            fields: ['channel'],
            limit: 100,
          })
        )
      ).rejects.toThrow(NotFoundException);
    });

    it('calls canAccess with correct arguments', async () => {
      const { service, accessDecisionService } = createService();

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['viewer'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 100,
        })
      );

      expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
        'u1',
        ['viewer'],
        'DATA_MART',
        'dm1',
        'SEE',
        'p1'
      );
    });
  });

  describe('secondary failure resilience (FIX 3)', () => {
    it('resolves with totals: null when computeTotals rejects', async () => {
      const { service, reportTotalsService } = createService();
      reportTotalsService.computeTotals.mockRejectedValue(new Error('DWH totals boom'));

      const result = await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 100,
        })
      );

      expect(result.totals).toBeNull();
      expect(result.columns).toEqual(['channel', 'revenue']);
      expect(result.rows).toHaveLength(2);
    });

    it('resolves successfully when SUCCESS audit save rejects', async () => {
      const { service, dataMartRunService } = createService();
      dataMartRunService.recordMcpQueryRun.mockRejectedValue(new Error('DB write boom'));

      const result = await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 100,
        })
      );

      expect(result.columns).toEqual(['channel', 'revenue']);
      expect(result.rows).toHaveLength(2);
    });

    it('rethrows the ORIGINAL read error, not the audit error, when the FAILED run write also rejects', async () => {
      const { service, reader, dataMartRunService } = createService();
      reader.readReportDataBatch.mockRejectedValue(new Error('read boom'));
      dataMartRunService.recordMcpQueryRun.mockRejectedValue(new Error('audit write boom'));

      await expect(
        service.run(
          new QueryDataMartCommand({
            projectId: 'p1',
            userId: 'u1',
            roles: ['admin'],
            dataMartId: 'dm1',
            fields: ['channel'],
            limit: 100,
          })
        )
      ).rejects.toThrow('read boom');

      expect(reader.finalize).toHaveBeenCalledTimes(1);
    });
  });

  it('happy-path: fields + one slice + one aggregation → columns, rows, and totals block', async () => {
    const mockTotals = { 'revenue | SUM': 18 };
    const readerMock = {
      prepareReportData: jest
        .fn()
        .mockResolvedValue(
          new ReportDataDescription([
            new ReportDataHeader('channel', 'channel'),
            new ReportDataHeader('revenue', 'revenue'),
          ])
        ),
      readReportDataBatch: jest.fn().mockResolvedValue(
        new ReportDataBatch(
          [
            ['fb', 10],
            ['org', 8],
          ],
          null
        )
      ),
      finalize: jest.fn().mockResolvedValue(undefined),
    };

    const service = new QueryDataMartService(
      { getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart) } as never,
      {
        compose: jest
          .fn()
          .mockResolvedValue({ sql: 'SELECT channel, SUM(revenue) FROM t GROUP BY 1', params: [] }),
      } as never,
      { resolve: jest.fn().mockResolvedValue(readerMock) } as never,
      { computeTotals: jest.fn().mockResolvedValue(mockTotals) } as never,
      { recordMcpQueryRun: jest.fn().mockResolvedValue(undefined) } as never,
      { canAccess: jest.fn().mockResolvedValue(true) } as never,
      { verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined) } as never,
      { registerMcpQueryRunConsumption: jest.fn().mockResolvedValue(undefined) } as never
    );

    const result = await service.run(
      new QueryDataMartCommand({
        projectId: 'p1',
        userId: 'u1',
        roles: ['admin'],
        dataMartId: 'dm1',
        fields: ['channel', 'revenue'],
        filterConfig: [
          {
            column: 'date',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: 7 },
            placement: 'pre-join',
          },
        ] as never,
        aggregationConfig: [{ column: 'revenue', function: 'SUM' as never }],
        limit: 100,
      })
    );

    expect(result.columns).toEqual(['channel', 'revenue']);
    expect(result.rows).toEqual([
      ['fb', 10],
      ['org', 8],
    ]);
    expect(result.truncated).toBe(false);
    expect(result.totals).toEqual(mockTotals);
  });

  describe('aggregated-path header/columnFilter alignment (#3)', () => {
    it('surfaces the reader dataHeaders as columns even when they differ from the requested fields', async () => {
      const { service, reader } = createService({
        dataHeaders: [
          new ReportDataHeader('channel', 'channel'),
          new ReportDataHeader('revenue | SUM', 'revenue | SUM'),
          new ReportDataHeader('Row Count', 'Row Count'),
        ],
        batches: [new ReportDataBatch([['fb', 18, 2]], null)],
      });

      const result = await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' as never }],
          limit: 100,
        })
      );

      // Aggregation renames/adds columns (`revenue | SUM`, `Row Count`), so the response
      // columns must follow the reader's actual headers, NOT the requested `fields`.
      expect(result.columns).toEqual(['channel', 'revenue | SUM', 'Row Count']);
      expect(result.rows).toEqual([['fb', 18, 2]]);

      // The requested raw fields are still passed as columnFilter, and the aggregation
      // config flows into both the read plan and the reader options.
      expect(reader.prepareReportData).toHaveBeenCalledWith(
        expect.objectContaining({
          columnConfig: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        }),
        expect.objectContaining({
          columnFilter: ['channel', 'revenue'],
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        })
      );
    });
  });

  describe('date bucketing (Task 10)', () => {
    it('sets dateTruncConfig on the read plan when date_buckets are provided', async () => {
      const { service, composer } = createService();

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['order_date', 'revenue'],
          dateTruncConfig: [{ column: 'order_date', unit: 'MONTH' }],
          limit: 100,
        })
      );

      expect(composer.compose).toHaveBeenCalledWith(
        expect.objectContaining({
          dateTruncConfig: [{ column: 'order_date', unit: 'MONTH' }],
        }),
        expect.anything()
      );
    });

    it('sets dateTruncConfig to null when not provided', async () => {
      const { service, composer } = createService();

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 100,
        })
      );

      expect(composer.compose).toHaveBeenCalledWith(
        expect.objectContaining({ dateTruncConfig: null }),
        expect.anything()
      );
    });
  });

  describe('billing gate (Task 9)', () => {
    it('throws ProjectOperationBlockedException when verifyCanPerformOperations rejects with OVERDRAFT_LIMIT_EXCEEDED', async () => {
      const { service, projectBalanceService } = createService();
      projectBalanceService.verifyCanPerformOperations.mockRejectedValue(
        new ProjectOperationBlockedException([ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED])
      );

      await expect(
        service.run(
          new QueryDataMartCommand({
            projectId: 'p1',
            userId: 'u1',
            roles: ['admin'],
            dataMartId: 'dm1',
            fields: ['channel'],
            limit: 100,
          })
        )
      ).rejects.toThrow(ProjectOperationBlockedException);
    });

    it('calls verifyCanPerformOperations with the project id', async () => {
      const { service, projectBalanceService } = createService();

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 100,
        })
      );

      expect(projectBalanceService.verifyCanPerformOperations).toHaveBeenCalledWith('p1');
    });

    it('calls registerMcpQueryRunConsumption once with (dataMart, runId) on success', async () => {
      const { service, consumptionTrackingService } = createService();

      await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 100,
        })
      );

      expect(consumptionTrackingService.registerMcpQueryRunConsumption).toHaveBeenCalledTimes(1);
      const [calledDm, calledRunId] =
        consumptionTrackingService.registerMcpQueryRunConsumption.mock.calls[0];
      expect(calledDm).toEqual(dataMart);
      expect(typeof calledRunId).toBe('string');
      expect(calledRunId).toHaveLength(36); // UUID v4
    });

    it('does NOT fail the read when registerMcpQueryRunConsumption rejects', async () => {
      const { service, consumptionTrackingService } = createService();
      consumptionTrackingService.registerMcpQueryRunConsumption.mockRejectedValue(
        new Error('pubsub down')
      );

      const result = await service.run(
        new QueryDataMartCommand({
          projectId: 'p1',
          userId: 'u1',
          roles: ['admin'],
          dataMartId: 'dm1',
          fields: ['channel', 'revenue'],
          limit: 100,
        })
      );

      expect(result.columns).toEqual(['channel', 'revenue']);
      expect(result.rows).toHaveLength(2);
    });
  });
});
