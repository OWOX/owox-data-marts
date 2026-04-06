import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';
import { getTable } from './migration-utils';

export class RefactorDataMartOwnersToJoinTables1774700000000 implements MigrationInterface {
  public readonly name = 'RefactorDataMartOwnersToJoinTables1774700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Create join tables
    const hasTechTable = await queryRunner.hasTable('data_mart_technical_owners');
    if (!hasTechTable) {
      await queryRunner.createTable(
        new Table({
          name: 'data_mart_technical_owners',
          columns: [
            { name: 'data_mart_id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'user_id', type: 'varchar', length: '255', isPrimary: true },
          ],
          foreignKeys: [
            {
              columnNames: ['data_mart_id'],
              referencedTableName: 'data_mart',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
        true
      );
      await queryRunner.createIndex(
        'data_mart_technical_owners',
        new TableIndex({ columnNames: ['data_mart_id'] })
      );
      await queryRunner.createIndex(
        'data_mart_technical_owners',
        new TableIndex({ columnNames: ['user_id'] })
      );
    }

    const hasBizTable = await queryRunner.hasTable('data_mart_business_owners');
    if (!hasBizTable) {
      await queryRunner.createTable(
        new Table({
          name: 'data_mart_business_owners',
          columns: [
            { name: 'data_mart_id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'user_id', type: 'varchar', length: '255', isPrimary: true },
          ],
          foreignKeys: [
            {
              columnNames: ['data_mart_id'],
              referencedTableName: 'data_mart',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
        true
      );
      await queryRunner.createIndex(
        'data_mart_business_owners',
        new TableIndex({ columnNames: ['data_mart_id'] })
      );
      await queryRunner.createIndex(
        'data_mart_business_owners',
        new TableIndex({ columnNames: ['user_id'] })
      );
    }

    // Step 2: Backfill from JSON columns
    const technicalRows: { id: string; technicalOwnerIds: string }[] = await queryRunner.query(`
      SELECT id, technicalOwnerIds FROM data_mart
      WHERE technicalOwnerIds IS NOT NULL
    `);

    for (const row of technicalRows) {
      try {
        const ids =
          typeof row.technicalOwnerIds === 'string'
            ? JSON.parse(row.technicalOwnerIds)
            : row.technicalOwnerIds;
        if (Array.isArray(ids)) {
          for (const userId of ids) {
            if (typeof userId === 'string' && userId.length > 0) {
              await queryRunner.query(
                `INSERT INTO data_mart_technical_owners (data_mart_id, user_id)
                 SELECT ?, ? WHERE NOT EXISTS (
                   SELECT 1 FROM data_mart_technical_owners WHERE data_mart_id = ? AND user_id = ?
                 )`,
                [row.id, userId, row.id, userId]
              );
            }
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`Skipping data_mart ${row.id}: invalid JSON in technicalOwnerIds`, e);
      }
    }

    const businessRows: { id: string; businessOwnerIds: string }[] = await queryRunner.query(`
      SELECT id, businessOwnerIds FROM data_mart
      WHERE businessOwnerIds IS NOT NULL
    `);

    for (const row of businessRows) {
      try {
        const ids =
          typeof row.businessOwnerIds === 'string'
            ? JSON.parse(row.businessOwnerIds)
            : row.businessOwnerIds;
        if (Array.isArray(ids)) {
          for (const userId of ids) {
            if (typeof userId === 'string' && userId.length > 0) {
              await queryRunner.query(
                `INSERT INTO data_mart_business_owners (data_mart_id, user_id)
                 SELECT ?, ? WHERE NOT EXISTS (
                   SELECT 1 FROM data_mart_business_owners WHERE data_mart_id = ? AND user_id = ?
                 )`,
                [row.id, userId, row.id, userId]
              );
            }
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`Skipping data_mart ${row.id}: invalid JSON in businessOwnerIds`, e);
      }
    }

    // Step 3: Drop old JSON columns
    const hasBizCol = await queryRunner.hasColumn('data_mart', 'businessOwnerIds');
    if (hasBizCol) {
      await queryRunner.dropColumn('data_mart', 'businessOwnerIds');
    }

    const hasTechCol = await queryRunner.hasColumn('data_mart', 'technicalOwnerIds');
    if (hasTechCol) {
      await queryRunner.dropColumn('data_mart', 'technicalOwnerIds');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Re-add JSON columns
    const table = await getTable(queryRunner, 'data_mart');

    const hasBizCol = await queryRunner.hasColumn('data_mart', 'businessOwnerIds');
    if (!hasBizCol) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'businessOwnerIds',
          type: 'json',
          isNullable: true,
          default: null,
        })
      );
    }

    const hasTechCol = await queryRunner.hasColumn('data_mart', 'technicalOwnerIds');
    if (!hasTechCol) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'technicalOwnerIds',
          type: 'json',
          isNullable: true,
          default: null,
        })
      );
    }

    // Step 2: Backfill JSON columns from join tables
    const techRows: { data_mart_id: string; user_id: string }[] = await queryRunner.query(
      `SELECT data_mart_id, user_id FROM data_mart_technical_owners`
    );
    const techByDm = new Map<string, string[]>();
    for (const row of techRows) {
      const list = techByDm.get(row.data_mart_id) ?? [];
      list.push(row.user_id);
      techByDm.set(row.data_mart_id, list);
    }
    for (const [dmId, userIds] of techByDm) {
      await queryRunner.query(`UPDATE data_mart SET technicalOwnerIds = ? WHERE id = ?`, [
        JSON.stringify(userIds),
        dmId,
      ]);
    }

    const bizRows: { data_mart_id: string; user_id: string }[] = await queryRunner.query(
      `SELECT data_mart_id, user_id FROM data_mart_business_owners`
    );
    const bizByDm = new Map<string, string[]>();
    for (const row of bizRows) {
      const list = bizByDm.get(row.data_mart_id) ?? [];
      list.push(row.user_id);
      bizByDm.set(row.data_mart_id, list);
    }
    for (const [dmId, userIds] of bizByDm) {
      await queryRunner.query(`UPDATE data_mart SET businessOwnerIds = ? WHERE id = ?`, [
        JSON.stringify(userIds),
        dmId,
      ]);
    }

    // Step 3: Drop join tables
    const hasTechTable = await queryRunner.hasTable('data_mart_technical_owners');
    if (hasTechTable) {
      await queryRunner.dropTable('data_mart_technical_owners');
    }

    const hasBizTable = await queryRunner.hasTable('data_mart_business_owners');
    if (hasBizTable) {
      await queryRunner.dropTable('data_mart_business_owners');
    }
  }
}
