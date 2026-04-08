import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBlendedFieldsConfigToDataMart1775600000000 implements MigrationInterface {
  public readonly name = 'AddBlendedFieldsConfigToDataMart1775600000000';

  private readonly TABLE = 'data_mart';
  private readonly COLUMN = 'blendedFieldsConfig';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(this.TABLE, this.COLUMN);
    if (!hasColumn) {
      await queryRunner.addColumn(
        this.TABLE,
        new TableColumn({
          name: this.COLUMN,
          type: 'json',
          isNullable: true,
          default: null,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(this.TABLE, this.COLUMN);
    if (hasColumn) {
      await queryRunner.dropColumn(this.TABLE, this.COLUMN);
    }
  }
}
