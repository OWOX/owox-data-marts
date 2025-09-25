import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import { softDropTable } from './helper';

export class CreateDataMartScheduledTriggerTable1750350724548 implements MigrationInterface {
  name = 'CreateDataMartScheduledTriggerTable1750350724548';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'data_mart_scheduled_trigger',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'type', type: 'varchar', isNullable: false },
          { name: 'dataMartId', type: 'varchar', isNullable: false },
          { name: 'cronExpression', type: 'varchar', isNullable: false },
          { name: 'timeZone', type: 'varchar', isNullable: false },
          { name: 'nextRunTimestamp', type: 'datetime', isNullable: true },
          { name: 'lastRunTimestamp', type: 'datetime', isNullable: true },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'triggerConfig', type: 'json', isNullable: true },
          { name: 'createdById', type: 'varchar', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );
    await queryRunner.createForeignKey(
      'data_mart_scheduled_trigger',
      new TableForeignKey({
        columnNames: ['dataMartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'data_mart_scheduled_trigger');
  }
}
