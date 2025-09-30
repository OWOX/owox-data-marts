import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateConnectorStateTable1750350724545 implements MigrationInterface {
  name = 'CreateConnectorStateTable1750350724545';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'connector_state',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'datamartId', type: 'varchar', isUnique: true, isNullable: false },
          { name: 'state', type: 'json', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [{ name: 'IDX_connector_state_datamartId', columnNames: ['datamartId'] }],
      }),
      true
    );
    await queryRunner.createForeignKey(
      'connector_state',
      new TableForeignKey({
        columnNames: ['datamartId'],
        referencedTableName: 'data_mart',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'connector_state');
  }
}
