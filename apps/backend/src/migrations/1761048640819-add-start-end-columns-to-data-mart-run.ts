import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddStartEndColumnsToDataMartRun1761048640819 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddStartEndColumnsToDataMartRun1761048640819';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'startedAt',
        type: 'datetime',
        isNullable: true,
        default: null,
      })
    );

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'finishedAt',
        type: 'datetime',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.dropColumn(table, 'finishedAt');
    await queryRunner.dropColumn(table, 'startedAt');
  }
}
