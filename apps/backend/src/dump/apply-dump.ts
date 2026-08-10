import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { QueryRunner } from 'typeorm/query-runner/QueryRunner';
import envPaths from 'env-paths';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createLogger } from '../common/logger/logger.service';
import { createDataSourceOptions } from '../config/data-source-options.config';
import {
  createPluginCollectionsDataSourceOptions,
  PLUGIN_COLLECTIONS_DATA_SOURCE,
} from '../config/plugin-collections-data-source-options.config';

const logger = createLogger('DumperApplier');
const paths = envPaths('owox', { suffix: '' });

const FILE_EXT = '.jsonp';
const DUMP_DIR = path.join(paths.data, 'db-backup');
const BATCH_SIZE = 1000;
const COLLECTION_DOCUMENT_BATCH_SIZE = 10;

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

function createDataSources(): Array<{ name: string; dataSource: DataSource }> {
  const configService = new ConfigService();
  return [
    { name: 'main', dataSource: new DataSource(createDataSourceOptions(configService)) },
    {
      name: PLUGIN_COLLECTIONS_DATA_SOURCE,
      dataSource: new DataSource(createPluginCollectionsDataSourceOptions(configService)),
    },
  ];
}

export async function applyDump() {
  if (!fs.existsSync(DUMP_DIR)) {
    logger.error(`Backup doesn't exist: ${DUMP_DIR}`);
    return;
  }

  const sources = createDataSources();
  for (const source of sources) await source.dataSource.initialize();
  const files = fs.readdirSync(DUMP_DIR).filter(f => f.endsWith(FILE_EXT));

  try {
    const claimedFiles = new Set<string>();
    const filesBySource = new Map<string, string[]>();
    for (const { name, dataSource } of sources) {
      const tableNames = new Set(dataSource.entityMetadatas.map(entity => entity.tableName));
      const sourceFiles = files.filter(file => tableNames.has(path.basename(file, FILE_EXT)));
      filesBySource.set(name, sourceFiles);
      sourceFiles.forEach(file => claimedFiles.add(file));
    }
    const unknownFiles = files.filter(file => !claimedFiles.has(file));
    if (unknownFiles.length) {
      throw new Error(`No configured data source owns dump files: ${unknownFiles.join(', ')}`);
    }
    for (const { name, dataSource } of sources) {
      await applyFiles(dataSource, filesBySource.get(name) ?? [], name);
    }
    logger.log(`All entities applied successfully`);
  } finally {
    for (const { dataSource } of [...sources].reverse()) {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  }
}

async function applyFiles(dataSource: DataSource, files: string[], sourceName: string) {
  if (files.length === 0) return;
  const dbType = dataSource.options.type;
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await disableForeignKeys(queryRunner, dbType);
  await queryRunner.startTransaction();
  try {
    for (const file of files) {
      const tableName = path.basename(file, FILE_EXT);
      const batchSize =
        tableName === 'plugin_collection_document' ? COLLECTION_DOCUMENT_BATCH_SIZE : BATCH_SIZE;
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
        if (batch.length === batchSize) {
          await insertBatch(queryRunner, tableName, batch);
          totalRows += batch.length;
          batch = [];
        }
      }
      if (batch.length > 0) {
        await insertBatch(queryRunner, tableName, batch);
        totalRows += batch.length;
      }
      logger.log(`Applied ${totalRows} rows to ${sourceName}.${tableName} from file ${filePath}`);
    }
    await queryRunner.commitTransaction();
  } catch (err: unknown) {
    await queryRunner.rollbackTransaction();
    throw err;
  } finally {
    await enableForeignKeys(queryRunner, dbType);
    await queryRunner.release();
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
