import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTitleColumnToAiAssistantSession1770100000010 implements MigrationInterface {
  name = 'AddTitleColumnToAiAssistantSession1770100000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTitleColumn = await queryRunner.hasColumn('ai_assistant_session', 'title');
    if (hasTitleColumn) {
      return;
    }

    await queryRunner.addColumn(
      'ai_assistant_session',
      new TableColumn({
        name: 'title',
        type: 'varchar',
        length: '255',
        isNullable: true,
        default: null,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTitleColumn = await queryRunner.hasColumn('ai_assistant_session', 'title');
    if (!hasTitleColumn) {
      return;
    }

    await queryRunner.dropColumn('ai_assistant_session', 'title');
  }
}
