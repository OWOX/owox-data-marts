import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateContextTables1776000000000 implements MigrationInterface {
  public readonly name = 'CreateContextTables1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. context table
    await queryRunner.createTable(
      new Table({
        name: 'context',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'name', type: 'varchar', length: '255' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'projectId', type: 'varchar', length: '255' },
          { name: 'createdById', type: 'varchar', length: '255', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'deletedAt', type: 'datetime', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'context',
      new TableIndex({ name: 'idx_context_project', columnNames: ['projectId'] })
    );

    // 2. data_mart_contexts join table
    await queryRunner.createTable(
      new Table({
        name: 'data_mart_contexts',
        columns: [
          { name: 'data_mart_id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'context_id', type: 'varchar', length: '36', isPrimary: true },
        ],
        foreignKeys: [
          {
            columnNames: ['data_mart_id'],
            referencedTableName: 'data_mart',
            referencedColumnNames: ['id'],
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
      'data_mart_contexts',
      new TableIndex({ name: 'idx_dmc_context', columnNames: ['context_id'] })
    );

    // 3. storage_contexts join table
    await queryRunner.createTable(
      new Table({
        name: 'storage_contexts',
        columns: [
          { name: 'storage_id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'context_id', type: 'varchar', length: '36', isPrimary: true },
        ],
        foreignKeys: [
          {
            columnNames: ['storage_id'],
            referencedTableName: 'data_storage',
            referencedColumnNames: ['id'],
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
      'storage_contexts',
      new TableIndex({ name: 'idx_sc_context', columnNames: ['context_id'] })
    );

    // 4. destination_contexts join table
    await queryRunner.createTable(
      new Table({
        name: 'destination_contexts',
        columns: [
          { name: 'destination_id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'context_id', type: 'varchar', length: '36', isPrimary: true },
        ],
        foreignKeys: [
          {
            columnNames: ['destination_id'],
            referencedTableName: 'data_destination',
            referencedColumnNames: ['id'],
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
      'destination_contexts',
      new TableIndex({ name: 'idx_dc_context', columnNames: ['context_id'] })
    );

    // 5. member_role_scope table
    await queryRunner.createTable(
      new Table({
        name: 'member_role_scope',
        columns: [
          { name: 'user_id', type: 'varchar', length: '255', isPrimary: true },
          { name: 'project_id', type: 'varchar', length: '255', isPrimary: true },
          { name: 'role_scope', type: 'varchar', length: '255', default: "'entire_project'" },
        ],
      }),
      true
    );

    // 6. member_role_contexts table
    await queryRunner.createTable(
      new Table({
        name: 'member_role_contexts',
        columns: [
          { name: 'user_id', type: 'varchar', length: '255', isPrimary: true },
          { name: 'project_id', type: 'varchar', length: '255', isPrimary: true },
          { name: 'context_id', type: 'varchar', length: '36', isPrimary: true },
        ],
        foreignKeys: [
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
      'member_role_contexts',
      new TableIndex({ name: 'idx_mrc_context', columnNames: ['context_id'] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('member_role_contexts', true);
    await queryRunner.dropTable('member_role_scope', true);
    await queryRunner.dropTable('destination_contexts', true);
    await queryRunner.dropTable('storage_contexts', true);
    await queryRunner.dropTable('data_mart_contexts', true);
    await queryRunner.dropTable('context', true);
  }
}
