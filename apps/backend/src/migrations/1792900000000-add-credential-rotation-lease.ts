import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddCredentialRotationLease1792900000000 implements MigrationInterface {
  public readonly name = 'AddCredentialRotationLease1792900000000';

  private readonly TABLE = 'credential';
  private readonly COLUMNS = [
    new TableColumn({ name: 'rotationLeaseId', type: 'varchar', length: '36', isNullable: true }),
    new TableColumn({ name: 'rotationLeaseAt', type: 'datetime', isNullable: true }),
    new TableColumn({ name: 'refreshTokenStaticAt', type: 'datetime', isNullable: true }),
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of this.COLUMNS) {
      // Read again each time: SQLite rebuilds the table on every added column.
      const table = await getTable(queryRunner, this.TABLE);
      if (!table.findColumnByName(column.name)) {
        await queryRunner.addColumn(table, column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [...this.COLUMNS].reverse()) {
      const table = await getTable(queryRunner, this.TABLE);
      if (table.findColumnByName(column.name)) {
        await queryRunner.dropColumn(table, column.name);
      }
    }
  }
}
