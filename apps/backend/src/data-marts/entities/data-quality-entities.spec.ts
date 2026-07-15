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
import { DataQualityCheckResult } from './data-quality-check-result.entity';
import { DataQualityRun } from './data-quality-run.entity';
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

  it('models DataQualityRun as a cascading one-to-one child of DataMartRun', () => {
    const relation = getMetadataArgsStorage().relations.find(
      item => item.target === DataQualityRun && item.propertyName === 'dataMartRun'
    );
    expect(relation).toMatchObject({ relationType: 'one-to-one' });
    expect(relation?.options).toMatchObject({ onDelete: 'CASCADE' });
    expect(column(DataQualityRun, 'dataMartRunId').options.unique).toBe(true);

    const inverse = getMetadataArgsStorage().relations.find(
      item => item.target === DataMartRun && item.propertyName === 'dataQualityRun'
    );
    expect(inverse?.relationType).toBe('one-to-one');
    expect(column(DataQualityRun, 'consumptionPublishedAt').options).toMatchObject({
      type: 'datetime',
      nullable: true,
    });
    expect(column(DataQualityRun, 'definitionTypeSnapshot').options).toMatchObject({
      type: 'varchar',
      nullable: false,
    });
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

  it('models check results as cascading children and validates JSON payloads', () => {
    const relation = getMetadataArgsStorage().relations.find(
      item => item.target === DataQualityCheckResult && item.propertyName === 'dataQualityRun'
    );
    expect(relation).toMatchObject({ relationType: 'many-to-one' });
    expect(relation?.options).toMatchObject({ onDelete: 'CASCADE' });
    expect(
      getMetadataArgsStorage().indices.find(
        item =>
          item.target === DataQualityCheckResult && item.name === 'UQ_data_quality_result_rule'
      )
    ).toMatchObject({ columns: ['dataQualityRunId', 'ruleKeyHash'] });

    const result = new DataQualityCheckResult();
    result.ruleKey = 'null_rate:field:email';
    result.category = DataQualityCategory.NULL_RATE;
    result.scope = { type: DataQualityScope.FIELD, fieldId: 'email' };
    result.severity = DataQualitySeverity.NOTICE;
    result.status = DataQualityCheckStatus.FAILED;
    result.violationCount = 2;
    result.description = 'Email contains null values';
    result.examples = [{ values: { email: null } }];
    result.executedSql = ['SELECT COUNT(*) FROM source'];
    result.reproductionSql = 'SELECT * FROM source WHERE email IS NULL';
    result.updateRuleKeyHash();

    expect(result.severity).toBe('notice');
    expect(result.ruleKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(column(DataQualityCheckResult, 'ruleKey').options).toMatchObject({
      type: 'text',
    });
    expect(column(DataQualityCheckResult, 'ruleKeyHash').options).toMatchObject({
      type: 'varchar',
      length: 64,
    });
    expect(column(DataQualityCheckResult, 'violationCount').options).toMatchObject({
      type: 'bigint',
    });
    expect(transformer(DataQualityCheckResult, 'violationCount').from('2147483648')).toBe(
      2_147_483_648
    );
    expect(column(DataQualityCheckResult, 'severity').options).toMatchObject({ type: 'varchar' });
    expect(transformer(DataQualityCheckResult, 'scope').to(result.scope)).toEqual(result.scope);
    expect(transformer(DataQualityCheckResult, 'examples').to(result.examples)).toEqual(
      result.examples
    );
  });

  it('serializes config, schema, relationships, and summary snapshots', () => {
    const run = new DataQualityRun();
    run.configSnapshot = createAllDisabledDataQualityConfig();
    run.schemaSnapshot = null;
    run.relationshipSnapshots = [];
    run.definitionTypeSnapshot = DataMartDefinitionType.TABLE;
    run.timezone = 'UTC';
    run.summary = {
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

    expect(transformer(DataQualityRun, 'configSnapshot').to(run.configSnapshot)).toEqual(
      run.configSnapshot
    );
    expect(transformer(DataQualityRun, 'schemaSnapshot').to(run.schemaSnapshot)).toBeNull();
    expect(
      transformer(DataQualityRun, 'relationshipSnapshots').to(run.relationshipSnapshots)
    ).toEqual([]);
    expect(transformer(DataQualityRun, 'summary').to(run.summary)).toEqual(run.summary);
  });
});
