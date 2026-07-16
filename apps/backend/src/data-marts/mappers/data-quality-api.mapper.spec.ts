import { BadRequestException } from '@nestjs/common';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataQualityApiMapper } from './data-quality-api.mapper';

describe('DataQualityApiMapper', () => {
  const mapper = new DataQualityApiMapper();
  const config = {
    timezone: 'UTC',
    rules: [
      {
        key: 'empty_table:data_mart',
        category: DataQualityCategory.EMPTY_TABLE,
        scope: { type: DataQualityScope.DATA_MART },
        severity: DataQualitySeverity.ERROR,
        enabled: true,
        parameters: {},
      },
    ],
  };

  it('Zod-parses a complete unversioned replacement config', () => {
    expect(mapper.toReplacementConfig(config)).toEqual(config);
    expect(mapper.toReplacementConfig(null)).toBeNull();
  });

  it('returns a typed 400 for malformed replacement config', () => {
    expect(() => mapper.toReplacementConfig({ ...config, timezone: 'Mars/Olympus' })).toThrow(
      BadRequestException
    );
  });

  it('distinguishes Run from Save & Run, including a null preset reset', () => {
    expect(mapper.toRunInput({})).toEqual({ hasConfig: false });
    expect(mapper.toRunInput({ config })).toEqual({ hasConfig: true, config });
    expect(mapper.toRunInput({ config: null })).toEqual({ hasConfig: true, config: null });
  });

  it('rejects unknown Run fields instead of silently dropping them', () => {
    expect(() => mapper.toRunInput({ configuration: config })).toThrow(BadRequestException);
  });

  it('deduplicates batch ids in stable request order', () => {
    expect(mapper.toBatchIds({ dataMartIds: ['b', 'a', 'b'] })).toEqual(['b', 'a']);
  });

  it('rejects more than 200 unique batch ids', () => {
    expect(() =>
      mapper.toBatchIds({ dataMartIds: Array.from({ length: 201 }, (_, index) => `dm-${index}`) })
    ).toThrow(BadRequestException);
  });

  it('applies the 200 cap after stable de-duplication', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `dm-${index}`);
    expect(mapper.toBatchIds({ dataMartIds: [...ids, ...ids] })).toHaveLength(200);
  });

  it('maps parent-run fields into the compact latest response', () => {
    const run = qualityRun();

    expect(mapper.toLatestResponse(run)).toEqual({
      runId: 'run-1',
      summary: run.dataQualitySummary,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    });
  });

  it('redacts only sensitive relationship result fields without losing counters', () => {
    const run = qualityRun();
    run.dataQualityResults![0] = {
      ...run.dataQualityResults![0],
      description: 'Missing target tuple SELECT hidden_customer FROM secret_table',
      error: {
        code: 'WAREHOUSE_DENIED',
        message: 'CREATE VIEW hidden AS SELECT secret FROM private_table',
        details: { providerMessage: 'SELECT secret FROM private_table', safeCounter: 2 },
      },
    };

    const details = mapper.toRunDetails(
      run,
      new Map([
        ['target-1', false],
        ['target-2', true],
      ])
    );

    expect(details).toMatchObject({
      snapshot: run.dataQualitySnapshot,
      summary: run.dataQualitySummary,
      results: [
        {
          ruleKey: 'relationship_integrity:relationship:rel-1',
          status: DataQualityCheckStatus.FAILED,
          violationCount: 2,
          examples: [],
          executedSql: [],
          reproductionSql: null,
          description:
            'Relationship check details are hidden because the target Data Mart is not accessible.',
          error: {
            code: 'WAREHOUSE_DENIED',
            message:
              'Relationship check error details are hidden because the target Data Mart is not accessible.',
            details: null,
          },
          redacted: true,
        },
        {
          ruleKey: 'reverse_relationship:relationship:rel-2',
          examples: [{ values: { id: 2 } }],
          executedSql: ['SELECT visible'],
          reproductionSql: 'SELECT visible',
          redacted: false,
        },
        {
          ruleKey: 'empty_table:data_mart',
          examples: [{ values: { rows: 0 } }],
          executedSql: ['SELECT local'],
          reproductionSql: 'SELECT local',
          redacted: false,
        },
        {
          ruleKey: 'relationship_integrity:relationship:missing',
          examples: [],
          executedSql: [],
          reproductionSql: null,
          redacted: true,
        },
      ],
    });
  });

  function qualityRun(): DataMartRun {
    const summary = {
      state: DataQualitySummaryState.ISSUES,
      enabledChecks: 4,
      totalChecks: 4,
      passedChecks: 0,
      failedChecks: 4,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 2,
      errorFindings: 0,
      violationCount: 5,
      highestSeverity: DataQualitySeverity.WARNING,
    };
    const result = (
      ruleKey: string,
      category: DataQualityCategory,
      scope: { type: DataQualityScope; relationshipId?: string },
      sql: string,
      example: Record<string, unknown>
    ) => ({
      id: `result-${ruleKey}`,
      ruleKey,
      category,
      scope,
      severity: DataQualitySeverity.WARNING,
      status: DataQualityCheckStatus.FAILED,
      violationCount: 1,
      description: 'finding',
      examples: [{ values: example }],
      executedSql: [sql],
      reproductionSql: sql,
      error: null,
      createdAt: '2026-01-01T00:00:02.000Z',
    });

    return {
      id: 'run-1',
      dataMartId: 'dm-1',
      type: 'DATA_QUALITY',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      startedAt: new Date('2026-01-01T00:00:01.000Z'),
      finishedAt: new Date('2026-01-01T00:00:02.000Z'),
      dataQualitySnapshot: {
        config: { timezone: 'UTC', rules: [] },
        schema: null,
        relationships: [
          {
            id: 'rel-1',
            sourceDataMartId: 'dm-1',
            targetDataMartId: 'target-1',
            targetAlias: 'hidden',
            joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
          },
          {
            id: 'rel-2',
            sourceDataMartId: 'dm-1',
            targetDataMartId: 'target-2',
            targetAlias: 'visible',
            joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
          },
        ],
        timezone: 'UTC',
        definitionType: DataMartDefinitionType.TABLE,
      },
      dataQualitySummary: summary,
      dataQualityResults: [
        {
          ...result(
            'relationship_integrity:relationship:rel-1',
            DataQualityCategory.RELATIONSHIP_INTEGRITY,
            { type: DataQualityScope.RELATIONSHIP, relationshipId: 'rel-1' },
            'SELECT hidden',
            { id: 1 }
          ),
          violationCount: 2,
        },
        result(
          'reverse_relationship:relationship:rel-2',
          DataQualityCategory.REVERSE_RELATIONSHIP,
          { type: DataQualityScope.RELATIONSHIP, relationshipId: 'rel-2' },
          'SELECT visible',
          { id: 2 }
        ),
        result(
          'empty_table:data_mart',
          DataQualityCategory.EMPTY_TABLE,
          { type: DataQualityScope.DATA_MART },
          'SELECT local',
          { rows: 0 }
        ),
        result(
          'relationship_integrity:relationship:missing',
          DataQualityCategory.RELATIONSHIP_INTEGRITY,
          { type: DataQualityScope.RELATIONSHIP, relationshipId: 'missing' },
          'SELECT unknown target',
          { id: 3 }
        ),
      ],
    } as unknown as DataMartRun;
  }
});
