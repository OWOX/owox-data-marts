import { DataSource } from 'typeorm';
import { AddDataQualityFoundation1784066400000 } from './1784066400000-add-data-quality-foundation';
import { ReconcileDataQualityRunStorage1784274000000 } from './1784274000000-reconcile-data-quality-run-storage';

describe('ReconcileDataQualityRunStorage1784274000000', () => {
  it('repairs a database that already recorded the earlier DQ migration shape', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      migrations: [
        AddDataQualityFoundation1784066400000,
        ReconcileDataQualityRunStorage1784274000000,
      ],
      migrationsTableName: 'migrations',
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    try {
      await dataSource.query(
        'CREATE TABLE migrations (id integer PRIMARY KEY AUTOINCREMENT NOT NULL, timestamp bigint NOT NULL, name varchar NOT NULL)'
      );
      await dataSource.query('INSERT INTO migrations (timestamp, name) VALUES (?, ?)', [
        1784066400000,
        'AddDataQualityFoundation1784066400000',
      ]);
      await dataSource.query('CREATE TABLE data_mart_run (id varchar PRIMARY KEY NOT NULL)');
      await dataSource.query(
        `CREATE TABLE data_quality_run (
          id varchar(36) PRIMARY KEY NOT NULL,
          dataMartRunId varchar(36) NOT NULL UNIQUE,
          configSnapshot json NOT NULL,
          schemaSnapshot json,
          relationshipSnapshots json NOT NULL,
          definitionTypeSnapshot varchar NOT NULL,
          timezone varchar(255) NOT NULL,
          summary json NOT NULL,
          createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          modifiedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          startedAt datetime,
          finishedAt datetime,
          consumptionPublishedAt datetime,
          FOREIGN KEY (dataMartRunId) REFERENCES data_mart_run(id)
            ON DELETE CASCADE ON UPDATE NO ACTION
        )`
      );
      await dataSource.query(
        `CREATE TABLE data_quality_check_result (
          id varchar(36) PRIMARY KEY NOT NULL,
          dataQualityRunId varchar(36) NOT NULL,
          ruleKey text NOT NULL,
          ruleKeyHash varchar(64) NOT NULL,
          category varchar(64) NOT NULL,
          scope json NOT NULL,
          severity varchar(16) NOT NULL,
          status varchar(32) NOT NULL,
          violationCount bigint NOT NULL DEFAULT 0,
          description text NOT NULL,
          examples json NOT NULL,
          executedSql json NOT NULL,
          reproductionSql text,
          errorCode varchar(255),
          errorMessage text,
          errorDetails json,
          createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (dataQualityRunId) REFERENCES data_quality_run(id)
            ON DELETE CASCADE ON UPDATE NO ACTION
        )`
      );
      await dataSource.query(
        'CREATE INDEX IDX_data_quality_check_result_run ON data_quality_check_result (dataQualityRunId)'
      );
      await dataSource.query(
        `CREATE UNIQUE INDEX UQ_data_quality_result_rule
         ON data_quality_check_result (dataQualityRunId, ruleKeyHash)`
      );
      await dataSource.query(
        `CREATE TABLE data_quality_run_triggers (
          id varchar(36) PRIMARY KEY NOT NULL,
          createdById varchar NOT NULL,
          projectId varchar NOT NULL,
          dataMartRunId varchar(36) NOT NULL,
          runType varchar NOT NULL,
          isActive boolean NOT NULL,
          status varchar NOT NULL DEFAULT 'IDLE',
          version int NOT NULL DEFAULT 1,
          createdAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          modifiedAt datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (dataMartRunId) REFERENCES data_mart_run(id)
            ON DELETE CASCADE ON UPDATE NO ACTION
        )`
      );
      await dataSource.query(
        `CREATE UNIQUE INDEX UQ_data_quality_run_trigger_run
         ON data_quality_run_triggers (dataMartRunId)`
      );

      const config = {
        timezone: 'UTC',
        rules: [
          {
            key: 'empty_table:data_mart',
            category: 'empty_table',
            scope: { type: 'DATA_MART' },
            severity: 'error',
            enabled: true,
            isApplicable: true,
            parameters: {},
          },
        ],
      };
      const summary = {
        state: 'EXECUTION_FAILED',
        enabledChecks: 1,
        totalChecks: 1,
        passedChecks: 0,
        failedChecks: 0,
        notApplicableChecks: 0,
        errorChecks: 1,
        noticeFindings: 0,
        warningFindings: 0,
        errorFindings: 0,
        violationCount: 0,
        highestSeverity: 'error',
      };
      await dataSource.query('INSERT INTO data_mart_run (id) VALUES (?)', ['run-1']);
      await dataSource.query(
        `INSERT INTO data_quality_run_triggers (
          id, createdById, projectId, dataMartRunId, runType, isActive, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['trigger-1', 'user-1', 'project-1', 'run-1', 'DATA_QUALITY', 1, 'IDLE']
      );
      await dataSource.query(
        `INSERT INTO data_quality_run (
          id, dataMartRunId, configSnapshot, schemaSnapshot, relationshipSnapshots,
          definitionTypeSnapshot, timezone, summary, consumptionPublishedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'quality-run-1',
          'run-1',
          JSON.stringify(config),
          null,
          '[]',
          'SQL',
          'UTC',
          JSON.stringify(summary),
          '2026-07-15 18:16:44',
        ]
      );
      await dataSource.query(
        `INSERT INTO data_quality_check_result (
          id, dataQualityRunId, ruleKey, ruleKeyHash, category, scope, severity, status,
          violationCount, description, examples, executedSql, reproductionSql,
          errorCode, errorMessage, errorDetails, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'result-1',
          'quality-run-1',
          'empty_table:data_mart',
          'c5f1d6d808f98cf63869b0e00085412d22024aa3ed9f7b9eef6e6ac7cbe0af28',
          'empty_table',
          JSON.stringify({ type: 'DATA_MART' }),
          'error',
          'ERROR',
          0,
          'Warehouse metadata is unavailable',
          JSON.stringify([{ values: { marker: 1 } }]),
          JSON.stringify(['SELECT COUNT(*) FROM source']),
          'SELECT * FROM source',
          'METADATA_UNAVAILABLE',
          'Warehouse metadata is unavailable',
          JSON.stringify({ provider: 'BigQuery' }),
          '2026-07-15 18:16:43',
        ]
      );

      const executed = await dataSource.runMigrations();

      expect(executed.map(item => item.name)).toEqual([
        'ReconcileDataQualityRunStorage1784274000000',
      ]);
      const runTable = await dataSource.createQueryRunner().getTable('data_mart_run');
      expect(runTable?.columns.map(column => column.name)).toEqual(
        expect.arrayContaining([
          'dataQualitySnapshot',
          'dataQualitySummary',
          'dataQualityResults',
          'dataQualityConsumptionPublishedAt',
        ])
      );

      const [run] = (await dataSource.query(
        `SELECT dataQualitySnapshot, dataQualitySummary, dataQualityResults,
                dataQualityConsumptionPublishedAt
         FROM data_mart_run WHERE id = ?`,
        ['run-1']
      )) as Array<Record<string, unknown>>;
      expect(JSON.parse(String(run.dataQualitySnapshot))).toEqual({
        config,
        schema: null,
        relationships: [],
        timezone: 'UTC',
        definitionType: 'SQL',
      });
      expect(JSON.parse(String(run.dataQualitySummary))).toEqual(summary);
      expect(JSON.parse(String(run.dataQualityResults))).toEqual([
        {
          id: 'result-1',
          ruleKey: 'empty_table:data_mart',
          category: 'empty_table',
          scope: { type: 'DATA_MART' },
          severity: 'error',
          status: 'ERROR',
          violationCount: 0,
          description: 'Warehouse metadata is unavailable',
          examples: [{ values: { marker: 1 } }],
          executedSql: ['SELECT COUNT(*) FROM source'],
          reproductionSql: 'SELECT * FROM source',
          error: {
            code: 'METADATA_UNAVAILABLE',
            message: 'Warehouse metadata is unavailable',
            details: { provider: 'BigQuery' },
          },
          createdAt: '2026-07-15T18:16:43.000Z',
        },
      ]);
      expect(run.dataQualityConsumptionPublishedAt).toBe('2026-07-15 18:16:44');
      await expect(dataSource.createQueryRunner().hasTable('data_quality_run')).resolves.toBe(
        false
      );
      await expect(
        dataSource.createQueryRunner().hasTable('data_quality_check_result')
      ).resolves.toBe(false);
      await expect(
        dataSource.createQueryRunner().hasTable('data_quality_run_backup')
      ).resolves.toBe(true);
      await expect(
        dataSource.createQueryRunner().hasTable('data_quality_check_result_backup')
      ).resolves.toBe(true);
      await expect(
        dataSource.query('SELECT id, dataMartRunId FROM data_quality_run_backup')
      ).resolves.toEqual([{ id: 'quality-run-1', dataMartRunId: 'run-1' }]);
      await expect(
        dataSource.query(
          'SELECT id, dataQualityRunId, ruleKeyHash FROM data_quality_check_result_backup'
        )
      ).resolves.toEqual([
        {
          id: 'result-1',
          dataQualityRunId: 'quality-run-1',
          ruleKeyHash: 'c5f1d6d808f98cf63869b0e00085412d22024aa3ed9f7b9eef6e6ac7cbe0af28',
        },
      ]);
      await expect(
        dataSource.query('SELECT id, dataMartRunId, status FROM data_quality_run_triggers')
      ).resolves.toEqual([{ id: 'trigger-1', dataMartRunId: 'run-1', status: 'IDLE' }]);
      await expect(dataSource.query('PRAGMA foreign_key_check')).resolves.toEqual([]);
      await expect(dataSource.runMigrations()).resolves.toEqual([]);
    } finally {
      await dataSource.destroy();
    }
  });

  it('is a no-op after the current foundation migration has already added the columns', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.query(
        'CREATE TABLE data_mart (id varchar PRIMARY KEY NOT NULL, status varchar NOT NULL)'
      );
      await queryRunner.query('CREATE TABLE data_mart_run (id varchar PRIMARY KEY NOT NULL)');
      await new AddDataQualityFoundation1784066400000().up(queryRunner);

      await new ReconcileDataQualityRunStorage1784274000000().up(queryRunner);

      const runTable = await queryRunner.getTable('data_mart_run');
      expect(
        runTable?.columns
          .filter(column => column.name.startsWith('dataQuality'))
          .map(item => item.name)
      ).toEqual([
        'dataQualitySnapshot',
        'dataQualitySummary',
        'dataQualityResults',
        'dataQualityConsumptionPublishedAt',
      ]);
      await expect(queryRunner.hasTable('data_quality_run_backup')).resolves.toBe(false);
      await expect(queryRunner.hasTable('data_quality_check_result_backup')).resolves.toBe(false);
    } finally {
      await queryRunner.release();
      await dataSource.destroy();
    }
  });
});
