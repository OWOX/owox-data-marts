import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const TABLE = 'data_mart_search_index';
const INDEX = 'idx_dmsi_project';

const SQLITE_DDL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    data_mart_id VARCHAR(36)  NOT NULL PRIMARY KEY,
    project_id   VARCHAR(255) NOT NULL,
    embedding    BLOB         NULL,
    dim          SMALLINT     NULL,
    doc_hash     CHAR(64)     NOT NULL,
    model        VARCHAR(128) NOT NULL,
    updated_at   DATETIME     NOT NULL
  )
`.trim();

const SQLITE_INDEX = `CREATE INDEX IF NOT EXISTS ${INDEX} ON ${TABLE} (project_id)`;

const MYSQL_DDL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    data_mart_id VARCHAR(36)  NOT NULL,
    project_id   VARCHAR(255) NOT NULL,
    embedding    BLOB         NULL,
    dim          SMALLINT     NULL,
    doc_hash     CHAR(64)     NOT NULL,
    model        VARCHAR(128) NOT NULL,
    updated_at   DATETIME     NOT NULL,
    PRIMARY KEY (data_mart_id),
    INDEX ${INDEX} (project_id)
  )
`.trim();

const MYSQL_ER_DUP_KEYNAME = 1061;

@Injectable()
export class SchemaManagerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaManagerService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    const type = this.dataSource.options.type;

    try {
      if (type === 'better-sqlite3') {
        await this.bootstrapSqlite();
      } else if (type === 'mysql') {
        await this.bootstrapMysql();
      } else {
        this.logger.warn(`Unsupported DB type "${type}" — skipping search index DDL`);
      }
    } catch (err) {
      this.logger.error('Failed to create search index schema', err);
    }
  }

  private async bootstrapSqlite(): Promise<void> {
    await this.dataSource.query(SQLITE_DDL);
    await this.dataSource.query(SQLITE_INDEX);
  }

  private async bootstrapMysql(): Promise<void> {
    await this.dataSource.query(MYSQL_DDL);
    try {
      await this.dataSource.query(`CREATE INDEX ${INDEX} ON ${TABLE} (project_id)`);
    } catch (err: unknown) {
      const code = (err as { errno?: number }).errno;
      if (code !== MYSQL_ER_DUP_KEYNAME) {
        this.logger.error('Failed to create search index on project_id', err);
      }
    }
  }
}
