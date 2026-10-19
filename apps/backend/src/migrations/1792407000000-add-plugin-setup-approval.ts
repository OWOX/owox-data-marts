import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class AddPluginSetupApproval1792407000000 implements MigrationInterface {
  name = 'AddPluginSetupApproval1792407000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'plugin_installation',
      new TableColumn({ name: 'revision', type: 'integer', default: 1 })
    );
    await queryRunner.createTable(
      new Table({
        name: 'plugin_setup_approval',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          ...['projectId', 'userId', 'operationId'].map(name => ({
            name,
            type: 'varchar',
            length: '255',
          })),
          ...['pluginId', 'versionId'].map(name => ({ name, type: 'varchar', length: '36' })),
          { name: 'purpose', type: 'varchar', length: '16' },
          { name: 'expectedRevision', type: 'integer' },
          { name: 'status', type: 'varchar', length: '16', default: "'pending'" },
          { name: 'expiresAt', type: 'datetime' },
          { name: 'installationId', type: 'varchar', length: '36', isNullable: true },
          { name: 'completedRevision', type: 'integer', isNullable: true },
          { name: 'selectionsDigest', type: 'varchar', length: '64', isNullable: true },
          { name: 'completedAt', type: 'datetime', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          new TableIndex({
            name: 'idx_plugin_setup_approval_member',
            columnNames: ['projectId', 'userId', 'pluginId'],
          }),
        ],
      })
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'plugin_setup_approval');
    await queryRunner.dropColumn('plugin_installation', 'revision');
  }
}
