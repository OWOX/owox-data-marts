import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUserProvisioningContextSettingsTables1777200000000 implements MigrationInterface {
  public readonly name = 'CreateUserProvisioningContextSettingsTables1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_provisioning_context_settings',
        columns: [
          { name: 'project_id', type: 'varchar', length: '255', isPrimary: true },
          { name: 'role_scope', type: 'varchar', length: '255', default: "'entire_project'" },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_provisioning_context_settings_contexts',
        columns: [
          { name: 'project_id', type: 'varchar', length: '255', isPrimary: true },
          { name: 'context_id', type: 'varchar', length: '36', isPrimary: true },
        ],
        foreignKeys: [
          {
            columnNames: ['project_id'],
            referencedTableName: 'user_provisioning_context_settings',
            referencedColumnNames: ['project_id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['context_id'],
            referencedTableName: 'context',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'user_provisioning_context_settings_contexts',
      new TableIndex({ name: 'idx_upcsc_context', columnNames: ['context_id'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_provisioning_context_settings_contexts', true);
    await queryRunner.dropTable('user_provisioning_context_settings', true);
  }
}
