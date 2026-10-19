import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddContextReferenceGuard1792402000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'context_reference_guard',
        columns: [
          { name: 'projectId', type: 'varchar', length: '255', isPrimary: true },
          { name: 'revision', type: 'int', default: 0 },
        ],
      })
    );
    const quote = (name: string) => queryRunner.connection.driver.escape(name);
    await queryRunner.query(
      `INSERT INTO ${quote('context_reference_guard')} (${quote('projectId')}, ${quote('revision')}) SELECT ${quote('projectId')}, 1 FROM ${quote('context')} UNION SELECT ${quote('project_id')}, 1 FROM ${quote('member_role_scope')} UNION SELECT ${quote('project_id')}, 1 FROM ${quote('user_provisioning_context_settings')}`
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.renameTable(
      'context_reference_guard',
      'context_reference_guard_backup_1792402000000'
    );
  }
}
