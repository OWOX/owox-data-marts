import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

export class ChangeLastRunErrorToText1769760737000 implements MigrationInterface {
  private readonly TABLE_NAME = 'report';
  public readonly name = 'ChangeLastRunErrorToText1769760737000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.changeColumn(
      table,
      'lastRunError',
      new TableColumn({
        name: 'lastRunError',
        type: 'text',
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    await queryRunner.changeColumn(
      table,
      'lastRunError',
      new TableColumn({
        name: 'lastRunError',
        type: 'varchar',
        isNullable: true,
      })
    );
  }
}
