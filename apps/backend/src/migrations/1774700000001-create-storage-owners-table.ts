import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateStorageOwnersTable1774700000001 implements MigrationInterface {
  public readonly name = 'CreateStorageOwnersTable1774700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('storage_owners');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'storage_owners',
          columns: [
            { name: 'storage_id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'user_id', type: 'varchar', length: '255', isPrimary: true },
          ],
          foreignKeys: [
            {
              columnNames: ['storage_id'],
              referencedTableName: 'data_storage',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
        true
      );
      await queryRunner.createIndex(
        'storage_owners',
        new TableIndex({ columnNames: ['storage_id'] })
      );
      await queryRunner.createIndex('storage_owners', new TableIndex({ columnNames: ['user_id'] }));
    }

    // Backfill: insert creator as owner where created_by_id exists
    await queryRunner.query(`
      INSERT INTO storage_owners (storage_id, user_id)
      SELECT s.id, s.createdById FROM data_storage s
      WHERE s.createdById IS NOT NULL AND s.createdById != ''
      AND NOT EXISTS (
        SELECT 1 FROM storage_owners o WHERE o.storage_id = s.id AND o.user_id = s.createdById
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('storage_owners');
    if (hasTable) {
      await queryRunner.dropTable('storage_owners');
    }
  }
}
