import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddKnownMembersToNotificationSettings1773000000001 implements MigrationInterface {
  public readonly name = 'AddKnownMembersToNotificationSettings1773000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('project_notification_settings', 'knownMembers');
    if (hasColumn) {
      return;
    }

    await queryRunner.addColumn(
      'project_notification_settings',
      new TableColumn({
        name: 'knownMembers',
        type: 'json',
        isNullable: false,
        default: "'[]'",
      })
    );

    // Initialize knownMembers with current receivers for existing rows.
    // This prevents treating all existing ADMIN/EDITOR members as "new"
    // after deploy, which would re-subscribe manually unsubscribed users.
    await queryRunner.query(`UPDATE project_notification_settings SET knownMembers = receivers`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('project_notification_settings', 'knownMembers');
    if (!hasColumn) {
      return;
    }

    await queryRunner.dropColumn('project_notification_settings', 'knownMembers');
  }
}
