import * as fs from 'fs';
import * as path from 'path';
import envPaths from 'env-paths';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { once } from 'node:events';
import { createLogger } from '../common/logger/logger.service';
import { createDataSourceOptions } from '../config/data-source-options.config';
import {
  createPluginCollectionsDataSourceOptions,
  PLUGIN_COLLECTIONS_DATA_SOURCE,
} from '../config/plugin-collections-data-source-options.config';

const logger = createLogger('DumperCreator');
const paths = envPaths('owox', { suffix: '' });

const FILE_EXT = '.jsonp';
const DUMP_DIR = path.join(paths.data, 'db-backup');
const BATCH_SIZE = 1000;
const COLLECTION_DOCUMENT_BATCH_SIZE = 10;

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

export async function dumpInserts() {
  const sources = createDataSources();
  try {
    for (const source of sources) await source.dataSource.initialize();
    if (!fs.existsSync(DUMP_DIR)) {
      fs.mkdirSync(DUMP_DIR);
    }
    for (const source of sources) await dumpSource(source.name, source.dataSource);
    logger.log(`Dump complete successfully: ${DUMP_DIR}`);
  } finally {
    for (const { dataSource } of [...sources].reverse()) {
      if (dataSource.isInitialized) await dataSource.destroy();
    }
  }
}

async function dumpSource(sourceName: string, dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction(
    dataSource.options.type === 'mysql' ? 'REPEATABLE READ' : 'SERIALIZABLE'
  );
  try {
    for (const entity of dataSource.entityMetadatas) {
      const tableName = entity.tableName;
      const batchSize =
        tableName === 'plugin_collection_document' ? COLLECTION_DOCUMENT_BATCH_SIZE : BATCH_SIZE;
      const escapedTable = dataSource.driver.escape(tableName);
      const order = entity.primaryColumns
        .map(column => dataSource.driver.escape(column.databaseName))
        .join(', ');
      const filePath = path.join(DUMP_DIR, `${tableName + FILE_EXT}`);
      const writeStream = fs.createWriteStream(filePath, { flags: 'w' });
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const rows = await queryRunner.query(
          `SELECT * FROM ${escapedTable} ORDER BY ${order} LIMIT ${batchSize} OFFSET ${offset}`
        );
        if (rows.length === 0) break;
        for (const row of rows) {
          if (!writeStream.write(JSON.stringify(row) + '\n')) {
            await once(writeStream, 'drain');
          }
        }
        offset += batchSize;
        hasMore = rows.length === batchSize;
      }
      writeStream.end();
      await once(writeStream, 'finish');
      logger.log(`Dumped ${sourceName}.${tableName} to ${filePath}`);
    }
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
