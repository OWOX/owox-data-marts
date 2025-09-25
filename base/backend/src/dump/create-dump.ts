import * as fs from 'fs';
import * as path from 'path';
import envPaths from 'env-paths';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createLogger } from '../common/logger/logger.service';
import { createDataSourceOptions } from '../config/data-source-options.config';

const logger = createLogger('DumperCreator');
const paths = envPaths('owox', { suffix: '' });

const FILE_EXT = '.jsonp';
const DUMP_DIR = path.join(paths.data, 'db-backup');
const BATCH_SIZE = 1000;

function createDataSource() {
  const configService = new ConfigService();
  const dataSourceOptions = createDataSourceOptions(configService);
  return new DataSource(dataSourceOptions);
}

export async function dumpInserts() {
  const dataSource = createDataSource();
  await dataSource.initialize();
  if (!fs.existsSync(DUMP_DIR)) {
    fs.mkdirSync(DUMP_DIR);
  }
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const tableName = entity.tableName;
    const filePath = path.join(DUMP_DIR, `${tableName + FILE_EXT}`);
    const writeStream = fs.createWriteStream(filePath, { flags: 'w' });
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const rows = await dataSource.manager.query(
        `SELECT * FROM ${tableName} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
      );
      if (rows.length === 0) break;
      for (const row of rows) {
        writeStream.write(JSON.stringify(row) + '\n');
      }
      offset += BATCH_SIZE;
      hasMore = rows.length === BATCH_SIZE;
    }
    writeStream.end();
    logger.log(`Dumped ${tableName} to ${filePath}`);
  }
  await dataSource.destroy();
  logger.log(`Dump complete successfully: ${DUMP_DIR}`);
}
