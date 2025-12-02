import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class AddVersionColumnToReport1762534573842 implements MigrationInterface {
  private readonly TABLE_NAME = 'report';
  public readonly name = 'AddVersionColumnToReport1762534573842';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'version',
        type: 'int',
        isNullable: false,
        default: 1,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.dropColumn(table, 'version');
  }
}
