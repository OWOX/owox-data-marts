import { DataSource, QueryRunner, Table, TableColumn } from 'typeorm';
import { DataQualityConfigSchema } from '../data-marts/dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityRunTrigger } from '../data-marts/entities/data-quality-run-trigger.entity';
import { TriggerStatus } from '../common/scheduler/shared/entities/trigger-status';
import { RunType } from '../common/scheduler/shared/types';
import { AddDataQualityFoundation1784066400000 } from './1784066400000-add-data-quality-foundation';

jest.mock('../data-marts/dto/schemas/data-quality/data-quality-config.schema', () => {
  const actual = jest.requireActual<
    typeof import('../data-marts/dto/schemas/data-quality/data-quality-config.schema')
  >('../data-marts/dto/schemas/data-quality/data-quality-config.schema');
  return {
    ...actual,
    createAllDisabledDataQualityConfig: jest.fn(() => {
      throw new Error('Historical migration called the mutable runtime config factory');
    }),
  };
});

describe('AddDataQualityFoundation1784066400000', () => {
  const migration = new AddDataQualityFoundation1784066400000();

  const createUpRunner = () => {
    const dataMartTable = new Table({
      name: 'data_mart',
      columns: [
        new TableColumn({ name: 'id', type: 'varchar' }),
        new TableColumn({ name: 'status', type: 'varchar' }),
      ],
    });
    const dataMartRunTable = new Table({
      name: 'data_mart_run',
      columns: [new TableColumn({ name: 'id', type: 'varchar' })],
    });
    const createdTables: Table[] = [];
    const runner = {
      getTable: jest.fn().mockImplementation(async (name: string) => {
        if (name === dataMartTable.name) return dataMartTable;
        if (name === dataMartRunTable.name) return dataMartRunTable;
        return undefined;
      }),
      hasTable: jest.fn().mockImplementation(async (name: string) => {
        return (
          name === dataMartTable.name ||
          name === dataMartRunTable.name ||
          createdTables.some(table => table.name === name)
        );
      }),
      addColumn: jest.fn().mockImplementation(async (table: Table, addedColumn: TableColumn) => {
        table.addColumn(addedColumn);
      }),
      createTable: jest.fn().mockImplementation(async (table: Table) => {
        createdTables.push(table);
      }),
      query: jest.fn().mockResolvedValue([]),
    };
    return { runner, createdTables, dataMartRunTable };
  };

  it('uses a fixed backfill payload when the runtime config factory is unavailable', async () => {
    const { runner } = createUpRunner();

    await expect(migration.up(runner as unknown as QueryRunner)).resolves.toBeUndefined();

    const [, parameters] = runner.query.mock.calls[0] as [string, unknown[]];
    expect(parameters[0]).toBe('{"timezone":"UTC","rules":[]}');
  });

  it('adds nullable config JSON and backfills only non-published rows', async () => {
    const { runner } = createUpRunner();
    await migration.up(runner as unknown as QueryRunner);

    const addedColumn = runner.addColumn.mock.calls
      .map(call => call[1] as TableColumn)
      .find(column => column.name === 'dataQualityConfig');
    expect(addedColumn).toMatchObject({
      name: 'dataQualityConfig',
      type: 'json',
      isNullable: true,
    });

    expect(runner.query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = runner.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('status <> ?');
    expect(sql).toContain('dataQualityConfig IS NULL');
    expect(parameters[1]).toBe('PUBLISHED');
    expect(DataQualityConfigSchema.parse(JSON.parse(parameters[0] as string))).toEqual({
      timezone: 'UTC',
      rules: [],
    });
  });

  it('adds SQLite/MySQL-compatible Data Quality columns to runs and keeps the trigger table', async () => {
    const { runner: queryRunner, createdTables, dataMartRunTable: runTable } = createUpRunner();
    await migration.up(queryRunner as unknown as QueryRunner);

    expect(runTable.findColumnByName('dataQualitySnapshot')?.type).toBe('json');
    expect(runTable.findColumnByName('dataQualitySummary')?.type).toBe('json');
    expect(runTable.findColumnByName('dataQualityResults')?.type).toBe('json');
    expect(runTable.findColumnByName('dataQualityConsumptionPublishedAt')?.type).toBe('datetime');
    expect(await queryRunner.hasTable('data_quality_run')).toBe(false);
    expect(await queryRunner.hasTable('data_quality_check_result')).toBe(false);
    expect(await queryRunner.hasTable('data_quality_run_triggers')).toBe(true);

    expect(createdTables.map(table => table.name)).toEqual(['data_quality_run_triggers']);
    const triggerTable = createdTables[0];
    expect(triggerTable.columns.map(item => item.name)).toEqual(
      expect.arrayContaining([
        'id',
        'isActive',
        'version',
        'status',
        'createdAt',
        'modifiedAt',
        'createdById',
        'projectId',
        'dataMartRunId',
        'runType',
      ])
    );
    expect(triggerTable.foreignKeys[0]).toMatchObject({
      columnNames: ['dataMartRunId'],
      referencedTableName: 'data_mart_run',
      onDelete: 'CASCADE',
    });
  });

  it('applies on real SQLite and persists a trigger through the TypeORM repository', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [DataQualityRunTrigger],
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
      await queryRunner.query('INSERT INTO data_mart (id, status) VALUES (?, ?), (?, ?)', [
        'published-dm',
        'PUBLISHED',
        'draft-dm',
        'DRAFT',
      ]);
      await queryRunner.query('INSERT INTO data_mart_run (id) VALUES (?)', ['dq-run-1']);

      await migration.up(queryRunner);

      const dataMartTable = await queryRunner.getTable('data_mart');
      const runTable = await queryRunner.getTable('data_mart_run');
      const triggerTable = await queryRunner.getTable('data_quality_run_triggers');
      expect(dataMartTable?.findColumnByName('dataQualityConfig')).toMatchObject({
        type: 'json',
        isNullable: true,
      });
      expect(runTable?.columns.map(column => column.name)).toEqual(
        expect.arrayContaining([
          'dataQualitySnapshot',
          'dataQualitySummary',
          'dataQualityResults',
          'dataQualityConsumptionPublishedAt',
        ])
      );
      expect(triggerTable?.foreignKeys).toEqual([
        expect.objectContaining({
          columnNames: ['dataMartRunId'],
          referencedTableName: 'data_mart_run',
          referencedColumnNames: ['id'],
          onDelete: 'CASCADE',
        }),
      ]);

      const rows = (await queryRunner.query(
        'SELECT id, dataQualityConfig FROM data_mart ORDER BY id'
      )) as Array<{ id: string; dataQualityConfig: string | null }>;
      expect(rows).toEqual([
        {
          id: 'draft-dm',
          dataQualityConfig: JSON.stringify({ timezone: 'UTC', rules: [] }),
        },
        { id: 'published-dm', dataQualityConfig: null },
      ]);

      const repository = queryRunner.manager.getRepository(DataQualityRunTrigger);
      const saved = await repository.save(
        repository.create({
          createdById: 'user-1',
          projectId: 'project-1',
          dataMartRunId: 'dq-run-1',
          runType: RunType.manual,
          isActive: true,
          status: TriggerStatus.IDLE,
        })
      );
      await expect(repository.findOneByOrFail({ id: saved.id })).resolves.toMatchObject({
        projectId: 'project-1',
        dataMartRunId: 'dq-run-1',
        runType: RunType.manual,
        isActive: true,
        status: TriggerStatus.IDLE,
      });
    } finally {
      await queryRunner.release();
      await dataSource.destroy();
    }
  });

  it('reverses the column and tables in dependency order', async () => {
    const dataMartTable = new Table({
      name: 'data_mart',
      columns: [new TableColumn({ name: 'dataQualityConfig', type: 'json', isNullable: true })],
    });
    const dataMartRunTable = new Table({
      name: 'data_mart_run',
      columns: [
        new TableColumn({ name: 'dataQualitySnapshot', type: 'json', isNullable: true }),
        new TableColumn({ name: 'dataQualitySummary', type: 'json', isNullable: true }),
        new TableColumn({ name: 'dataQualityResults', type: 'json', isNullable: true }),
        new TableColumn({
          name: 'dataQualityConsumptionPublishedAt',
          type: 'datetime',
          isNullable: true,
        }),
      ],
    });
    const runner = {
      getTable: jest.fn().mockImplementation(async (name: string) => {
        if (name === dataMartTable.name) return dataMartTable;
        if (name === dataMartRunTable.name) return dataMartRunTable;
        return undefined;
      }),
      hasTable: jest.fn().mockImplementation(async (name: string) => {
        return name === 'data_quality_run_triggers';
      }),
      renameTable: jest.fn().mockResolvedValue(undefined),
      dropColumn: jest.fn().mockResolvedValue(undefined),
    };

    await migration.down(runner as unknown as QueryRunner);

    expect(runner.renameTable.mock.calls).toEqual([
      ['data_quality_run_triggers', 'data_quality_run_triggers_backup'],
    ]);
    expect(runner.dropColumn.mock.calls).toEqual([
      [dataMartRunTable, 'dataQualityConsumptionPublishedAt'],
      [dataMartRunTable, 'dataQualityResults'],
      [dataMartRunTable, 'dataQualitySummary'],
      [dataMartRunTable, 'dataQualitySnapshot'],
      [dataMartTable, 'dataQualityConfig'],
    ]);
  });
});
