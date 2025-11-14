import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddVersionColumnToReport1762534573842 implements MigrationInterface {
  private readonly TABLE_NAME = 'report';
  public readonly name = 'AddVersionColumnToReport1762534573842';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      this.TABLE_NAME,
      new TableColumn({
        name: 'version',
        type: 'int',
        isNullable: false,
        default: 1,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn(this.TABLE_NAME, 'version');
  }
}
