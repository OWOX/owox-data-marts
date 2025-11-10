import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStartEndColumnsToDataMartRun1761048640819 implements MigrationInterface {
  private readonly TABLE_NAME = 'data_mart_run';
  public readonly name = 'AddStartEndColumnsToDataMartRun1761048640819';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'startedAt',
        type: 'datetime',
        isNullable: true,
        default: null,
      })
    );

    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'finishedAt',
        type: 'datetime',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(this.TABLE_NAME, 'finishedAt');
    await queryRunner.dropColumn(this.TABLE_NAME, 'startedAt');
  }
}
