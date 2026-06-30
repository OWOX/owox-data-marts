import { MigrationInterface, QueryRunner } from 'typeorm';
import { getTable } from './migration-utils';

export class AddStorageDestinationCompositeIndex1778852008395 implements MigrationInterface {
  public readonly name = 'AddStorageDestinationCompositeIndex1778852008395';

  private readonly storageIndex = 'idx_ds_project_deleted_created';
  private readonly destinationIndex = 'idx_dd_project_deleted_created';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX \`${this.storageIndex}\` ON \`data_storage\` (projectId, deletedAt, createdAt ASC, id ASC)`
    );
    await queryRunner.query(
      `CREATE INDEX \`${this.destinationIndex}\` ON \`data_destination\` (projectId, deletedAt, createdAt ASC, id ASC)`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const storageTable = await getTable(queryRunner, 'data_storage');
    await queryRunner.dropIndex(storageTable, this.storageIndex);

    const destinationTable = await getTable(queryRunner, 'data_destination');
    await queryRunner.dropIndex(destinationTable, this.destinationIndex);
  }
}
