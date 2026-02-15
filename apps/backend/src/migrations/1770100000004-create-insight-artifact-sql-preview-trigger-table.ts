import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateInsightArtifactSqlPreviewTriggerTable1770100000004 implements MigrationInterface {
  name = 'CreateInsightArtifactSqlPreviewTriggerTable1770100000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'insight_artifact_sql_preview_triggers',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'userId', type: 'varchar', isNullable: false },
          { name: 'projectId', type: 'varchar', isNullable: false },
          { name: 'dataMartId', type: 'varchar', isNullable: false },
          { name: 'insightArtifactId', type: 'varchar', isNullable: false },
          { name: 'sql', type: 'text', isNullable: true },
          { name: 'isActive', type: 'boolean', isNullable: false },
          { name: 'status', type: 'varchar', isNullable: false, default: "'IDLE'" },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'uiResponse', type: 'json', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          {
            name: 'idx_insight_artifact_sql_preview_trigger_status',
            columnNames: ['status', 'isActive'],
          },
          {
            name: 'idx_insight_artifact_sql_preview_trigger_user',
            columnNames: ['userId'],
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'insight_artifact_sql_preview_triggers');
  }
}
