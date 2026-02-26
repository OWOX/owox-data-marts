import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';
import { softDropTable } from './migration-utils';

export class NormalizeInsightTemplateSources1770100000012 implements MigrationInterface {
  name = 'NormalizeInsightTemplateSources1770100000012';

  private readonly sourceTableName = 'insight_template_source';
  private readonly templateTableName = 'insight_template';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasSourceTable = await queryRunner.hasTable(this.sourceTableName);
    if (!hasSourceTable) {
      await queryRunner.createTable(
        new Table({
          name: this.sourceTableName,
          columns: [
            { name: 'id', type: 'varchar', isPrimary: true },
            { name: 'templateId', type: 'varchar', isNullable: false },
            { name: 'key', type: 'varchar', length: '64', isNullable: false },
            { name: 'type', type: 'varchar', length: '64', isNullable: false },
            { name: 'artifactId', type: 'varchar', isNullable: false },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          ],
        }),
        true
      );
    }

    const sourceTable = await queryRunner.getTable(this.sourceTableName);
    if (sourceTable) {
      const uniqueTemplateKey = sourceTable.indices.find(
        index => index.name === 'uq_ins_tpl_source_template_key'
      );
      if (!uniqueTemplateKey) {
        await queryRunner.createIndex(
          this.sourceTableName,
          new TableIndex({
            name: 'uq_ins_tpl_source_template_key',
            columnNames: ['templateId', 'key'],
            isUnique: true,
          })
        );
      }

      const templateIndex = sourceTable.indices.find(
        index => index.name === 'idx_ins_tpl_source_template'
      );
      if (!templateIndex) {
        await queryRunner.createIndex(
          this.sourceTableName,
          new TableIndex({
            name: 'idx_ins_tpl_source_template',
            columnNames: ['templateId'],
          })
        );
      }

      const artifactIndex = sourceTable.indices.find(
        index => index.name === 'idx_ins_tpl_source_artifact'
      );
      if (!artifactIndex) {
        await queryRunner.createIndex(
          this.sourceTableName,
          new TableIndex({
            name: 'idx_ins_tpl_source_artifact',
            columnNames: ['artifactId'],
          })
        );
      }

      const templateForeignKey = sourceTable.foreignKeys.find(
        foreignKey =>
          foreignKey.columnNames.length === 1 && foreignKey.columnNames[0] === 'templateId'
      );
      if (!templateForeignKey) {
        await queryRunner.createForeignKey(
          this.sourceTableName,
          new TableForeignKey({
            columnNames: ['templateId'],
            referencedTableName: this.templateTableName,
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
            onUpdate: 'NO ACTION',
          })
        );
      }

      const artifactForeignKey = sourceTable.foreignKeys.find(
        foreignKey =>
          foreignKey.columnNames.length === 1 && foreignKey.columnNames[0] === 'artifactId'
      );
      if (!artifactForeignKey) {
        await queryRunner.createForeignKey(
          this.sourceTableName,
          new TableForeignKey({
            columnNames: ['artifactId'],
            referencedTableName: 'insight_artifact',
            referencedColumnNames: ['id'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION',
          })
        );
      }
    }

    const hasLegacySources = await queryRunner.hasColumn(this.templateTableName, 'sources');
    if (hasLegacySources) {
      await queryRunner.dropColumn(this.templateTableName, 'sources');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasLegacySources = await queryRunner.hasColumn(this.templateTableName, 'sources');
    if (!hasLegacySources) {
      await queryRunner.addColumn(
        this.templateTableName,
        new TableColumn({
          name: 'sources',
          type: 'json',
          isNullable: false,
          default: "'[]'",
        })
      );
    }

    await softDropTable(queryRunner, this.sourceTableName);
  }
}
