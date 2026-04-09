import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

export class AddOwnershipUserIdIndexes1774800000001 implements MigrationInterface {
  public readonly name = 'AddOwnershipUserIdIndexes1774800000001';

  private readonly indexes = [
    { table: 'data_mart_technical_owners', column: 'user_id' },
    { table: 'data_mart_business_owners', column: 'user_id' },
    { table: 'storage_owners', column: 'user_id' },
    { table: 'destination_owners', column: 'user_id' },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column } of this.indexes) {
      const hasTable = await queryRunner.hasTable(table);
      if (hasTable) {
        await queryRunner.createIndex(
          table,
          new TableIndex({ name: `IDX_${table}_${column}`, columnNames: [column] })
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, column } of this.indexes) {
      const hasTable = await queryRunner.hasTable(table);
      if (hasTable) {
        await queryRunner.dropIndex(table, `IDX_${table}_${column}`);
      }
    }
  }
}
