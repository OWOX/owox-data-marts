import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { getTable, softDropTable } from './migration-utils';

const ALL_DISABLED_DATA_QUALITY_CONFIG = Object.freeze({
  timezone: 'UTC',
  rules: Object.freeze([]),
});

export class AddDataQualityFoundation1784066400000 implements MigrationInterface {
  public readonly name = 'AddDataQualityFoundation1784066400000';

  private readonly DATA_MART_TABLE = 'data_mart';
  private readonly DATA_QUALITY_RUN_TABLE = 'data_quality_run';
  private readonly DATA_QUALITY_CHECK_RESULT_TABLE = 'data_quality_check_result';
  private readonly DATA_QUALITY_RUN_TRIGGER_TABLE = 'data_quality_run_triggers';
  private readonly CONFIG_COLUMN = 'dataQualityConfig';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dataMartTable = await getTable(queryRunner, this.DATA_MART_TABLE);
    if (!dataMartTable.columns.some(column => column.name === this.CONFIG_COLUMN)) {
      await queryRunner.addColumn(
        dataMartTable,
        new TableColumn({
          name: this.CONFIG_COLUMN,
          type: 'json',
          isNullable: true,
        })
      );
    }

    if (!(await queryRunner.hasTable(this.DATA_QUALITY_RUN_TABLE))) {
      await queryRunner.createTable(this.createDataQualityRunTable());
    }
    if (!(await queryRunner.hasTable(this.DATA_QUALITY_CHECK_RESULT_TABLE))) {
      await queryRunner.createTable(this.createDataQualityCheckResultTable());
    }
    if (!(await queryRunner.hasTable(this.DATA_QUALITY_RUN_TRIGGER_TABLE))) {
      await queryRunner.createTable(this.createDataQualityRunTriggerTable());
    }

    await queryRunner.query(
      `UPDATE ${this.DATA_MART_TABLE}
       SET ${this.CONFIG_COLUMN} = ?
       WHERE status <> ? AND ${this.CONFIG_COLUMN} IS NULL`,
      [JSON.stringify(ALL_DISABLED_DATA_QUALITY_CONFIG), 'PUBLISHED']
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(this.DATA_QUALITY_RUN_TRIGGER_TABLE)) {
      await softDropTable(queryRunner, this.DATA_QUALITY_RUN_TRIGGER_TABLE);
    }
    if (await queryRunner.hasTable(this.DATA_QUALITY_CHECK_RESULT_TABLE)) {
      await softDropTable(queryRunner, this.DATA_QUALITY_CHECK_RESULT_TABLE);
    }
    if (await queryRunner.hasTable(this.DATA_QUALITY_RUN_TABLE)) {
      await softDropTable(queryRunner, this.DATA_QUALITY_RUN_TABLE);
    }

    const dataMartTable = await getTable(queryRunner, this.DATA_MART_TABLE);
    if (dataMartTable.columns.some(column => column.name === this.CONFIG_COLUMN)) {
      await queryRunner.dropColumn(dataMartTable, this.CONFIG_COLUMN);
    }
  }

  private createDataQualityRunTable(): Table {
    return new Table({
      name: this.DATA_QUALITY_RUN_TABLE,
      columns: [
        { name: 'id', type: 'varchar', length: '36', isPrimary: true },
        {
          name: 'dataMartRunId',
          type: 'varchar',
          length: '36',
          isNullable: false,
          isUnique: true,
        },
        { name: 'configSnapshot', type: 'json', isNullable: false },
        { name: 'schemaSnapshot', type: 'json', isNullable: true },
        { name: 'relationshipSnapshots', type: 'json', isNullable: false },
        { name: 'definitionTypeSnapshot', type: 'varchar', isNullable: false },
        { name: 'timezone', type: 'varchar', length: '255', isNullable: false },
        { name: 'summary', type: 'json', isNullable: false },
        { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'startedAt', type: 'datetime', isNullable: true },
        { name: 'finishedAt', type: 'datetime', isNullable: true },
        { name: 'consumptionPublishedAt', type: 'datetime', isNullable: true },
      ],
      foreignKeys: [
        {
          columnNames: ['dataMartRunId'],
          referencedTableName: 'data_mart_run',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        },
      ],
    });
  }

  private createDataQualityCheckResultTable(): Table {
    return new Table({
      name: this.DATA_QUALITY_CHECK_RESULT_TABLE,
      columns: [
        { name: 'id', type: 'varchar', length: '36', isPrimary: true },
        { name: 'dataQualityRunId', type: 'varchar', length: '36', isNullable: false },
        { name: 'ruleKey', type: 'text', isNullable: false },
        { name: 'ruleKeyHash', type: 'varchar', length: '64', isNullable: false },
        { name: 'category', type: 'varchar', length: '64', isNullable: false },
        { name: 'scope', type: 'json', isNullable: false },
        { name: 'severity', type: 'varchar', length: '16', isNullable: false },
        { name: 'status', type: 'varchar', length: '32', isNullable: false },
        { name: 'violationCount', type: 'bigint', isNullable: false, default: 0 },
        { name: 'description', type: 'text', isNullable: false },
        { name: 'examples', type: 'json', isNullable: false },
        { name: 'executedSql', type: 'json', isNullable: false },
        { name: 'reproductionSql', type: 'text', isNullable: true },
        { name: 'errorCode', type: 'varchar', length: '255', isNullable: true },
        { name: 'errorMessage', type: 'text', isNullable: true },
        { name: 'errorDetails', type: 'json', isNullable: true },
        { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
      foreignKeys: [
        {
          columnNames: ['dataQualityRunId'],
          referencedTableName: this.DATA_QUALITY_RUN_TABLE,
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        },
      ],
      indices: [
        new TableIndex({
          name: 'IDX_data_quality_check_result_run',
          columnNames: ['dataQualityRunId'],
        }),
        new TableIndex({
          name: 'UQ_data_quality_result_rule',
          columnNames: ['dataQualityRunId', 'ruleKeyHash'],
          isUnique: true,
        }),
      ],
    });
  }

  private createDataQualityRunTriggerTable(): Table {
    return new Table({
      name: this.DATA_QUALITY_RUN_TRIGGER_TABLE,
      columns: [
        { name: 'id', type: 'varchar', length: '36', isPrimary: true },
        { name: 'createdById', type: 'varchar', isNullable: false },
        { name: 'projectId', type: 'varchar', isNullable: false },
        { name: 'dataMartRunId', type: 'varchar', length: '36', isNullable: false },
        { name: 'runType', type: 'varchar', isNullable: false },
        { name: 'isActive', type: 'boolean', isNullable: false },
        { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
        { name: 'version', type: 'int', isNullable: false, default: 1 },
        { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
      ],
      foreignKeys: [
        {
          columnNames: ['dataMartRunId'],
          referencedTableName: 'data_mart_run',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'NO ACTION',
        },
      ],
      indices: [
        new TableIndex({
          name: 'IDX_data_quality_run_trigger_status',
          columnNames: ['status', 'isActive'],
        }),
        new TableIndex({
          name: 'IDX_data_quality_run_trigger_project',
          columnNames: ['projectId'],
        }),
        new TableIndex({
          name: 'IDX_data_quality_run_trigger_created',
          columnNames: ['createdAt'],
        }),
        new TableIndex({
          name: 'UQ_data_quality_run_trigger_run',
          columnNames: ['dataMartRunId'],
          isUnique: true,
        }),
      ],
    });
  }
}
