import { QueryRunner, Table, TableColumn } from 'typeorm';
import { DataQualityConfigSchema } from '../data-marts/dto/schemas/data-quality/data-quality-config.schema';
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
    const createdTables: Table[] = [];
    const runner = {
      getTable: jest.fn().mockResolvedValue(dataMartTable),
      hasTable: jest.fn().mockResolvedValue(false),
      addColumn: jest.fn().mockResolvedValue(undefined),
      createTable: jest.fn().mockImplementation(async (table: Table) => {
        createdTables.push(table);
      }),
      query: jest.fn().mockResolvedValue([]),
    };
    return { runner, createdTables };
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

    expect(runner.addColumn).toHaveBeenCalledTimes(1);
    const addedColumn = runner.addColumn.mock.calls[0][1] as TableColumn;
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

  it('creates SQLite/MySQL-compatible run and result table shapes with cascading foreign keys', async () => {
    const { runner, createdTables } = createUpRunner();
    await migration.up(runner as unknown as QueryRunner);

    expect(createdTables.map(table => table.name)).toEqual([
      'data_quality_run',
      'data_quality_check_result',
      'data_quality_run_triggers',
    ]);
    const runTable = createdTables[0];
    const resultTable = createdTables[1];
    const triggerTable = createdTables[2];
    expect(runTable.columns.map(item => item.name)).toEqual(
      expect.arrayContaining([
        'id',
        'dataMartRunId',
        'configSnapshot',
        'schemaSnapshot',
        'relationshipSnapshots',
        'definitionTypeSnapshot',
        'timezone',
        'summary',
        'createdAt',
        'startedAt',
        'finishedAt',
        'consumptionPublishedAt',
      ])
    );
    expect(resultTable.columns.map(item => item.name)).toEqual(
      expect.arrayContaining([
        'id',
        'dataQualityRunId',
        'ruleKey',
        'ruleKeyHash',
        'category',
        'scope',
        'severity',
        'status',
        'violationCount',
        'description',
        'examples',
        'executedSql',
        'reproductionSql',
        'errorCode',
        'errorMessage',
        'errorDetails',
      ])
    );
    expect(resultTable.columns.find(item => item.name === 'ruleKey')).toMatchObject({
      type: 'text',
    });
    expect(resultTable.columns.find(item => item.name === 'ruleKeyHash')).toMatchObject({
      type: 'varchar',
      length: '64',
    });
    expect(resultTable.columns.find(item => item.name === 'violationCount')).toMatchObject({
      type: 'bigint',
    });
    const portableTypes = new Set([
      'varchar',
      'json',
      'text',
      'int',
      'bigint',
      'datetime',
      'boolean',
    ]);
    expect(
      [...runTable.columns, ...resultTable.columns, ...triggerTable.columns].every(column =>
        portableTypes.has(column.type)
      )
    ).toBe(true);
    expect(runTable.foreignKeys[0]).toMatchObject({
      columnNames: ['dataMartRunId'],
      referencedTableName: 'data_mart_run',
      onDelete: 'CASCADE',
    });
    expect(resultTable.foreignKeys[0]).toMatchObject({
      columnNames: ['dataQualityRunId'],
      referencedTableName: 'data_quality_run',
      onDelete: 'CASCADE',
    });
    expect(resultTable.indices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'UQ_data_quality_result_rule',
          columnNames: ['dataQualityRunId', 'ruleKeyHash'],
          isUnique: true,
        }),
      ])
    );
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

  it('reverses the column and tables in dependency order', async () => {
    const table = new Table({
      name: 'data_mart',
      columns: [new TableColumn({ name: 'dataQualityConfig', type: 'json', isNullable: true })],
    });
    const runner = {
      getTable: jest.fn().mockResolvedValue(table),
      hasTable: jest.fn().mockImplementation(async (name: string) => {
        return (
          name === 'data_quality_run' ||
          name === 'data_quality_check_result' ||
          name === 'data_quality_run_triggers'
        );
      }),
      renameTable: jest.fn().mockResolvedValue(undefined),
      dropColumn: jest.fn().mockResolvedValue(undefined),
    };

    await migration.down(runner as unknown as QueryRunner);

    expect(runner.renameTable.mock.calls).toEqual([
      ['data_quality_run_triggers', 'data_quality_run_triggers_backup'],
      ['data_quality_check_result', 'data_quality_check_result_backup'],
      ['data_quality_run', 'data_quality_run_backup'],
    ]);
    expect(runner.dropColumn).toHaveBeenCalledWith(table, 'dataQualityConfig');
  });
});
