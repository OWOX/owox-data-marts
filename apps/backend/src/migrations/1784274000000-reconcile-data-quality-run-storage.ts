import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable, softDropTable } from './migration-utils';

interface LegacyDataQualityRunRow {
  id: unknown;
  dataMartRunId: unknown;
  configSnapshot: unknown;
  schemaSnapshot: unknown;
  relationshipSnapshots: unknown;
  definitionTypeSnapshot: unknown;
  timezone: unknown;
  summary: unknown;
  consumptionPublishedAt: unknown;
}

interface LegacyDataQualityResultRow {
  id: unknown;
  ruleKey: unknown;
  category: unknown;
  scope: unknown;
  severity: unknown;
  status: unknown;
  violationCount: unknown;
  description: unknown;
  examples: unknown;
  executedSql: unknown;
  reproductionSql: unknown;
  errorCode: unknown;
  errorMessage: unknown;
  errorDetails: unknown;
  createdAt: unknown;
}

export class ReconcileDataQualityRunStorage1784274000000 implements MigrationInterface {
  public readonly name = 'ReconcileDataQualityRunStorage1784274000000';

  private readonly DATA_MART_RUN_TABLE = 'data_mart_run';
  private readonly LEGACY_DATA_QUALITY_RUN_TABLE = 'data_quality_run';
  private readonly LEGACY_DATA_QUALITY_RESULT_TABLE = 'data_quality_check_result';
  private readonly RUN_COLUMNS = [
    { name: 'dataQualitySnapshot', type: 'json' },
    { name: 'dataQualitySummary', type: 'json' },
    { name: 'dataQualityResults', type: 'json' },
    { name: 'dataQualityConsumptionPublishedAt', type: 'datetime' },
  ] as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureRunColumns(queryRunner);
    await this.migrateLegacyPayloads(queryRunner);

    if (await queryRunner.hasTable(this.LEGACY_DATA_QUALITY_RESULT_TABLE)) {
      await softDropTable(queryRunner, this.LEGACY_DATA_QUALITY_RESULT_TABLE);
    }
    if (await queryRunner.hasTable(this.LEGACY_DATA_QUALITY_RUN_TABLE)) {
      await softDropTable(queryRunner, this.LEGACY_DATA_QUALITY_RUN_TABLE);
    }
  }

  // Forward-only reconciliation: on current databases these columns belong to the earlier
  // foundation migration, while on databases created from an intermediate branch state this
  // migration adds them and preserves the superseded tables as backups.
  public async down(_queryRunner: QueryRunner): Promise<void> {}

  private async ensureRunColumns(queryRunner: QueryRunner): Promise<void> {
    for (const column of this.RUN_COLUMNS) {
      const table = await getTable(queryRunner, this.DATA_MART_RUN_TABLE);
      if (table.columns.some(existing => existing.name === column.name)) continue;
      await queryRunner.addColumn(table, new TableColumn({ ...column, isNullable: true }));
    }
  }

  private async migrateLegacyPayloads(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(this.LEGACY_DATA_QUALITY_RUN_TABLE))) return;

    const hasLegacyResults = await queryRunner.hasTable(this.LEGACY_DATA_QUALITY_RESULT_TABLE);
    const legacyRuns = (await queryRunner.query(
      `SELECT id, dataMartRunId, configSnapshot, schemaSnapshot,
              relationshipSnapshots, definitionTypeSnapshot, timezone, summary,
              consumptionPublishedAt
       FROM ${this.LEGACY_DATA_QUALITY_RUN_TABLE}`
    )) as LegacyDataQualityRunRow[];

    for (const legacyRun of legacyRuns) {
      const results = hasLegacyResults
        ? await this.readLegacyResults(queryRunner, String(legacyRun.id))
        : [];
      const snapshot = {
        config: parseJson(legacyRun.configSnapshot, { timezone: 'UTC', rules: [] }),
        schema: parseJson(legacyRun.schemaSnapshot, null),
        relationships: parseJson(legacyRun.relationshipSnapshots, []),
        timezone: String(legacyRun.timezone),
        definitionType: String(legacyRun.definitionTypeSnapshot),
      };

      await queryRunner.query(
        `UPDATE ${this.DATA_MART_RUN_TABLE}
         SET dataQualitySnapshot = COALESCE(dataQualitySnapshot, ?),
             dataQualitySummary = COALESCE(dataQualitySummary, ?),
             dataQualityResults = COALESCE(dataQualityResults, ?),
             dataQualityConsumptionPublishedAt = COALESCE(dataQualityConsumptionPublishedAt, ?)
         WHERE id = ?`,
        [
          JSON.stringify(snapshot),
          JSON.stringify(parseJson(legacyRun.summary, null)),
          JSON.stringify(results),
          legacyRun.consumptionPublishedAt ?? null,
          String(legacyRun.dataMartRunId),
        ]
      );
    }
  }

  private async readLegacyResults(
    queryRunner: QueryRunner,
    dataQualityRunId: string
  ): Promise<Record<string, unknown>[]> {
    const rows = (await queryRunner.query(
      `SELECT id, ruleKey, category, scope, severity, status, violationCount,
              description, examples, executedSql, reproductionSql, errorCode,
              errorMessage, errorDetails, createdAt
       FROM ${this.LEGACY_DATA_QUALITY_RESULT_TABLE}
       WHERE dataQualityRunId = ?
       ORDER BY createdAt, id`,
      [dataQualityRunId]
    )) as LegacyDataQualityResultRow[];

    return rows.map(row => {
      const errorMessage = nullableString(row.errorMessage);
      return {
        id: String(row.id),
        ruleKey: String(row.ruleKey),
        category: String(row.category),
        scope: parseJson(row.scope, {}),
        severity: String(row.severity),
        status: String(row.status),
        violationCount: nonNegativeSafeInteger(row.violationCount),
        description: String(row.description),
        examples: parseJson(row.examples, []),
        executedSql: parseJson(row.executedSql, []),
        reproductionSql: nullableString(row.reproductionSql),
        error: errorMessage
          ? {
              code: nullableString(row.errorCode),
              message: errorMessage,
              details: parseJson(row.errorDetails, null),
            }
          : null,
        createdAt: toIsoDate(row.createdAt),
      };
    });
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nonNegativeSafeInteger(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Cannot migrate Data Quality result with invalid createdAt: ${raw}`);
  }
  return parsed.toISOString();
}
