import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { getTable, softDropTable } from './migration-utils';

const ALL_DISABLED_DATA_QUALITY_CONFIG = Object.freeze({
  timezone: 'UTC',
  rules: Object.freeze([]),
});

export class AddDataQualityFoundation1784066400000 implements MigrationInterface {
  public readonly name = 'AddDataQualityFoundation1784066400000';

  private readonly DATA_MART_TABLE = 'data_mart';
  private readonly DATA_MART_RUN_TABLE = 'data_mart_run';
  private readonly DATA_QUALITY_RUN_TRIGGER_TABLE = 'data_quality_run_triggers';
  private readonly CONFIG_COLUMN = 'dataQualityConfig';
  private readonly DATA_MART_RUN_COLUMNS = [
    { name: 'dataQualitySnapshot', type: 'json' },
    { name: 'dataQualitySummary', type: 'json' },
    { name: 'dataQualityResults', type: 'json' },
    { name: 'dataQualityConsumptionPublishedAt', type: 'datetime' },
  ] as const;

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

    const dataMartRunTable = await getTable(queryRunner, this.DATA_MART_RUN_TABLE);
    for (const column of this.DATA_MART_RUN_COLUMNS) {
      if (!dataMartRunTable.columns.some(existing => existing.name === column.name)) {
        await queryRunner.addColumn(
          dataMartRunTable,
          new TableColumn({ ...column, isNullable: true })
        );
      }
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

    const dataMartRunTable = await getTable(queryRunner, this.DATA_MART_RUN_TABLE);
    for (const column of [...this.DATA_MART_RUN_COLUMNS].reverse()) {
      if (dataMartRunTable.columns.some(existing => existing.name === column.name)) {
        await queryRunner.dropColumn(dataMartRunTable, column.name);
      }
    }

    const dataMartTable = await getTable(queryRunner, this.DATA_MART_TABLE);
    if (dataMartTable.columns.some(column => column.name === this.CONFIG_COLUMN)) {
      await queryRunner.dropColumn(dataMartTable, this.CONFIG_COLUMN);
    }
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
