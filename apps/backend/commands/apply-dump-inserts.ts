import dataSource from '../src/data-source';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { createLogger } from '../src/common/logger/logger.service';
import { QueryRunner } from 'typeorm/query-runner/QueryRunner';
import envPaths from 'env-paths';

const logger = createLogger('DumperApplier');
const paths = envPaths('owox', { suffix: '' });

const FILE_EXT = '.jsonp';
const DUMP_DIR = path.join(paths.data, 'db-backup');
const BATCH_SIZE = 1000;

async function disableForeignKeys(queryRunner: QueryRunner, dbType: string) {
  if (dbType === 'sqlite') {
    await queryRunner.query('PRAGMA foreign_keys = OFF;');
  } else if (dbType === 'mysql') {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0;');
  } else if (dbType === 'postgres') {
    await queryRunner.query('SET session_replication_role = replica;');
  }
}

async function enableForeignKeys(queryRunner: QueryRunner, dbType: string) {
  if (dbType === 'sqlite') {
    await queryRunner.query('PRAGMA foreign_keys = ON;');
  } else if (dbType === 'mysql') {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1;');
  } else if (dbType === 'postgres') {
    await queryRunner.query('SET session_replication_role = DEFAULT;');
  }
}

async function applyDump() {
  await dataSource.initialize();
  const dbType = dataSource.options.type;
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await disableForeignKeys(queryRunner, dbType);
  await queryRunner.startTransaction();
  try {
    if (!fs.existsSync(DUMP_DIR)) {
      logger.error(`Backup doesn't exist: ${DUMP_DIR}`);
      return;
    }
    const files = fs.readdirSync(DUMP_DIR).filter(f => f.endsWith(FILE_EXT));
    for (const file of files) {
      const tableName = path.basename(file, FILE_EXT);
      const filePath = path.join(DUMP_DIR, file);
      const lines = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
        crlfDelay: Infinity,
      });
      let batch: Record<string, unknown>[] = [];
      let totalRows = 0;
      for await (const line of lines) {
        if (line.trim() === '') continue;

        batch.push(JSON.parse(line));
        if (batch.length === BATCH_SIZE) {
          await insertBatch(queryRunner, tableName, batch);
          totalRows += batch.length;
          batch = [];
        }
      }
      if (batch.length > 0) {
        await insertBatch(queryRunner, tableName, batch);
        totalRows += batch.length;
      }
      logger.log(`Applied ${totalRows} rows to table ${tableName} from file ${filePath}`);
    }
    await queryRunner.commitTransaction();
    logger.log(`All entities applied successfully`);
  } catch (err: unknown) {
    await queryRunner.rollbackTransaction();
    logger.error('Error applying dump:', err instanceof Error ? err.stack : String(err));
  } finally {
    await enableForeignKeys(queryRunner, dbType);
    await queryRunner.release();
    await dataSource.destroy();
  }
}

async function insertBatch(
  queryRunner: QueryRunner,
  tableName: string,
  batch: Record<string, unknown>[]
) {
  const table = await queryRunner.getTable(tableName);
  if (!table) throw new Error(`Table not found: ${tableName}`);
  const realColumnNames = table.columns.map(col => col.name);

  for (const row of batch) {
    const columns = Object.keys(row).filter(col => realColumnNames.includes(col));
    const values = columns.map(col => row[col]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    await queryRunner.query(sql, values);
  }
}

applyDump().catch((err: unknown) => logger.error(err instanceof Error ? err.stack : String(err)));
