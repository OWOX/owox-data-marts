import { describe, expect, it } from 'vitest';
import { mapDataMartRunResponseDtoToEntity } from './data-mart-run-mappers';
import type { DataMartRunResponseDto } from '../../../shared/types/api';

describe('mapDataMartRunResponseDtoToEntity', () => {
  it('preserves the lightweight Data Quality summary from shared run history', () => {
    const qualitySummary = {
      state: 'ISSUES' as const,
      enabledChecks: 2,
      totalChecks: 2,
      passedChecks: 1,
      failedChecks: 1,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 1,
      errorFindings: 0,
      violationCount: 4,
      highestSeverity: 'warning' as const,
      dataMartRunId: 'run-1',
      lastRunAt: '2026-07-15T12:00:00.000Z',
    };
    const dto = {
      id: 'run-1',
      dataMartId: 'mart-1',
      status: 'SUCCESS',
      createdAt: '2026-07-15T12:00:00.000Z',
      logs: [],
      errors: [],
      definitionRun: {},
      type: 'DATA_QUALITY',
      runType: 'manual',
      startedAt: '2026-07-15T12:00:00.000Z',
      finishedAt: '2026-07-15T12:01:00.000Z',
      reportDefinition: null,
      reportId: null,
      insightDefinition: null,
      insightId: null,
      insightTemplateDefinition: null,
      insightTemplateId: null,
      aiSourceDefinition: null,
      createdByUser: null,
      additionalParams: null,
      qualitySummary,
    } as unknown as DataMartRunResponseDto;

    expect(mapDataMartRunResponseDtoToEntity(dto).qualitySummary).toEqual(qualitySummary);
  });

  it('preserves embedded Data Quality details from a generic run response', () => {
    const dataQuality = {
      snapshot: {
        config: { timezone: 'UTC', rules: [] },
        schema: { fields: [] },
        relationships: [],
        timezone: 'UTC',
        definitionType: 'SQL',
      },
      summary: {
        state: 'PASSED' as const,
        enabledChecks: 1,
        totalChecks: 1,
        passedChecks: 1,
        failedChecks: 0,
        notApplicableChecks: 0,
        errorChecks: 0,
        noticeFindings: 0,
        warningFindings: 0,
        errorFindings: 0,
        violationCount: 0,
        highestSeverity: null,
      },
      results: [
        {
          id: 'result-1',
          ruleKey: 'empty_table:data_mart',
          category: 'empty_table',
          scope: { type: 'DATA_MART' },
          severity: 'error',
          status: 'PASSED',
          violationCount: 0,
          description: 'Table is not empty',
          examples: [],
          executedSql: ['SELECT COUNT(*) FROM source'],
          reproductionSql: 'SELECT * FROM source',
          error: null,
          redacted: false,
          createdAt: '2026-07-15T12:01:00.000Z',
        },
      ],
    };
    const dto = {
      id: 'run-1',
      dataMartId: 'mart-1',
      status: 'SUCCESS',
      createdAt: '2026-07-15T12:00:00.000Z',
      logs: [],
      errors: [],
      definitionRun: {},
      type: 'DATA_QUALITY',
      runType: 'manual',
      startedAt: '2026-07-15T12:00:00.000Z',
      finishedAt: '2026-07-15T12:01:00.000Z',
      reportDefinition: null,
      reportId: null,
      insightDefinition: null,
      insightId: null,
      insightTemplateDefinition: null,
      insightTemplateId: null,
      aiSourceDefinition: null,
      createdByUser: null,
      additionalParams: null,
      qualitySummary: null,
      dataQuality,
    } as unknown as DataMartRunResponseDto;

    expect(mapDataMartRunResponseDtoToEntity(dto).dataQuality).toEqual(dataQuality);
  });
});
