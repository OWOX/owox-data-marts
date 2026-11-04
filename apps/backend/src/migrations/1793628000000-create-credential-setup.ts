import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateCredentialSetup1793628000000 implements MigrationInterface {
  readonly name = 'CreateCredentialSetup1793628000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const createdAtIndex = new TableIndex({
      name: 'idx_credential_setup_created_at',
      columnNames: ['createdAt'],
    });
    const existing = await queryRunner.getTable('credential_setup');
    if (existing) {
      if (!existing.indices.some(index => index.name === createdAtIndex.name)) {
        await queryRunner.createIndex(existing, createdAtIndex);
      }
      return;
    }
    await queryRunner.createTable(
      new Table({
        name: 'credential_setup',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'projectId', type: 'varchar', length: '255' },
          { name: 'userId', type: 'varchar', length: '255' },
          { name: 'mode', type: 'varchar', length: '16' },
          { name: 'status', type: 'varchar', length: '16', default: "'pending'" },
          { name: 'definitionId', type: 'varchar', length: '255', isNullable: true },
          { name: 'credentialId', type: 'varchar', length: '36', isNullable: true },
          { name: 'title', type: 'varchar', length: '255', isNullable: true },
          { name: 'createdAt', type: 'datetime' },
          { name: 'expiresAt', type: 'datetime' },
          { name: 'completedAt', type: 'datetime', isNullable: true },
        ],
        indices: [createdAtIndex],
      })
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'credential_setup');
  }
}
