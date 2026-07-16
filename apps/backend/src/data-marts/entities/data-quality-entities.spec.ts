import { getMetadataArgsStorage, ValueTransformer } from 'typeorm';
import { DataQualityCategory } from '../enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../enums/data-quality-check-status.enum';
import { DataQualityScope } from '../enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../enums/data-quality-severity.enum';
import { DataQualitySummaryState } from '../enums/data-quality-summary-state.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { createAllDisabledDataQualityConfig } from '../dto/schemas/data-quality/data-quality-config.schema';
import { DataMart } from './data-mart.entity';
import { DataMartRun } from './data-mart-run.entity';
import { DataQualityRunTrigger } from './data-quality-run-trigger.entity';

describe('data quality entity metadata', () => {
  const column = (target: object, propertyName: string) => {
    const metadata = getMetadataArgsStorage().columns.find(
      item => item.target === target && item.propertyName === propertyName
    );
    expect(metadata).toBeDefined();
    return metadata!;
  };

  const transformer = (target: object, propertyName: string): ValueTransformer => {
    const value = column(target, propertyName).options.transformer;
    expect(value).toBeDefined();
    expect(Array.isArray(value)).toBe(false);
    return value as ValueTransformer;
  };

  it('serializes nullable DataMart.dataQualityConfig through its Zod transformer', () => {
    const metadata = column(DataMart, 'dataQualityConfig');
    expect(metadata.options).toMatchObject({ type: 'json', nullable: true });

    const config = createAllDisabledDataQualityConfig();
    expect(transformer(DataMart, 'dataQualityConfig').to(config)).toEqual(config);
    expect(transformer(DataMart, 'dataQualityConfig').from(config)).toEqual(config);
    expect(transformer(DataMart, 'dataQualityConfig').to(null)).toBeNull();
    expect(() =>
      transformer(DataMart, 'dataQualityConfig').to({ timezone: 'not/a_timezone', rules: [] })
    ).toThrow();
  });

  it('persists a one-shot Data Quality run trigger using the shared trigger contract', () => {
    const entity = getMetadataArgsStorage().tables.find(
      item => item.target === DataQualityRunTrigger
    );
    expect(entity?.name).toBe('data_quality_run_triggers');
    expect(column(DataQualityRunTrigger, 'dataMartRunId').options).toMatchObject({
      type: 'varchar',
    });
    expect(column(DataQualityRunTrigger, 'projectId').options).toBeDefined();
    expect(column(DataQualityRunTrigger, 'createdById').options).toBeDefined();
    expect(column(DataQualityRunTrigger, 'runType').options).toMatchObject({ type: 'varchar' });
  });

  it('stores strict nullable Data Quality payloads directly on DataMartRun', () => {
    const snapshotColumn = column(DataMartRun, 'dataQualitySnapshot');
    const summaryColumn = column(DataMartRun, 'dataQualitySummary');
    const resultsColumn = column(DataMartRun, 'dataQualityResults');
    const consumptionColumn = column(DataMartRun, 'dataQualityConsumptionPublishedAt');

    expect(snapshotColumn.options).toMatchObject({
      type: 'json',
      nullable: true,
      select: false,
    });
    expect(summaryColumn.options).toMatchObject({ type: 'json', nullable: true });
    expect(summaryColumn.options.select ?? true).toBe(true);
    expect(resultsColumn.options).toMatchObject({
      type: 'json',
      nullable: true,
      select: false,
    });
    expect(consumptionColumn.options).toMatchObject({
      type: 'datetime',
      nullable: true,
      select: false,
    });

    const snapshot = {
      config: createAllDisabledDataQualityConfig(),
      schema: null,
      relationships: [],
      timezone: 'UTC',
      definitionType: DataMartDefinitionType.TABLE,
    };
    const summary = {
      state: DataQualitySummaryState.NEVER_RUN,
      enabledChecks: 0,
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      notApplicableChecks: 0,
      errorChecks: 0,
      noticeFindings: 0,
      warningFindings: 0,
      errorFindings: 0,
      violationCount: 0,
      highestSeverity: null,
    };
    const storedResult = {
      id: 'result-1',
      ruleKey: 'null_rate:field:email',
      category: DataQualityCategory.NULL_RATE,
      scope: { type: DataQualityScope.FIELD, fieldId: 'email' },
      severity: DataQualitySeverity.NOTICE,
      status: DataQualityCheckStatus.FAILED,
      violationCount: 2,
      description: 'Email contains null values',
      examples: [{ values: { email: null } }],
      executedSql: ['SELECT COUNT(*) FROM source'],
      reproductionSql: 'SELECT * FROM source WHERE email IS NULL',
      error: null,
      createdAt: '2026-07-16T10:00:00.000Z',
    };

    expect(transformer(DataMartRun, 'dataQualitySnapshot').to(snapshot)).toEqual(snapshot);
    expect(transformer(DataMartRun, 'dataQualitySnapshot').to(null)).toBeNull();
    expect(() => {
      const { definitionType: _, ...invalidSnapshot } = snapshot;
      transformer(DataMartRun, 'dataQualitySnapshot').to(invalidSnapshot);
    }).toThrow();
    expect(transformer(DataMartRun, 'dataQualitySummary').to(summary)).toEqual(summary);
    expect(transformer(DataMartRun, 'dataQualitySummary').to(null)).toBeNull();
    expect(transformer(DataMartRun, 'dataQualityResults').to([storedResult])).toEqual([
      storedResult,
    ]);
    expect(transformer(DataMartRun, 'dataQualityResults').to(null)).toBeNull();
    expect(() =>
      transformer(DataMartRun, 'dataQualityResults').to([
        storedResult,
        { ...storedResult, id: 'result-2' },
      ])
    ).toThrow('Data Quality result rule keys must be unique');
    expect(() =>
      transformer(DataMartRun, 'dataQualityResults').to([
        { ...storedResult, createdAt: 'not-an-iso-datetime' },
      ])
    ).toThrow();
  });
});
