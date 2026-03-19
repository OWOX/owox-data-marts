import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOptedOutReceiversToNotificationSettings1773922564520 implements MigrationInterface {
  public readonly name = 'AddOptedOutReceiversToNotificationSettings1773922564520';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'project_notification_settings',
      'optedOutReceivers'
    );
    if (hasColumn) {
      return;
    }

    await queryRunner.addColumn(
      'project_notification_settings',
      new TableColumn({
        name: 'optedOutReceivers',
        type: 'json',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(
      'project_notification_settings',
      'optedOutReceivers'
    );
    if (!hasColumn) {
      return;
    }

    await queryRunner.dropColumn('project_notification_settings', 'optedOutReceivers');
  }
}
