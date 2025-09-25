import { QueryRunner } from 'typeorm';

/**
 * Instead of dropping tables, rename them to preserve data.
 *
 * @param queryRunner
 * @param tableName
 */
export async function softDropTable(queryRunner: QueryRunner, tableName: string) {
  let n = 0;
  let backupName = `${tableName}_backup`;
  while (await queryRunner.hasTable(backupName)) {
    n += 1;
    backupName = `${tableName}_backup_${n}`;
  }
  await queryRunner.renameTable(tableName, backupName);
}
