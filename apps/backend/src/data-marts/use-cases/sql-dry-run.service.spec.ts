import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { SqlDryRunCommand } from '../dto/domain/sql-dry-run.command';
import { SqlDryRunResult } from '../dto/domain/sql-dry-run-result.dto';
import { DataMart } from '../entities/data-mart.entity';
import {
  DataMartSqlReferenceErrorCode,
  DataMartSqlReferenceException,
} from '../sql-references/data-mart-sql-reference.errors';
import { SqlDryRunService } from './sql-dry-run.service';

const SAVED = 'aaaaaaaa-0000-4000-8000-000000000001';
const HIDDEN = 'bbbbbbbb-0000-4000-8000-000000000002';
const ref = (title: string, id: string) => `[${title}](dm:${id})`;

function createService(savedSql = `SELECT * FROM ${ref('Orders', SAVED)} o`) {
  const dataMart = Object.assign(new DataMart(), {
    id: 'dm-1',
    projectId: 'project-1',
    storage: { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY, config: {} },
    definition: { sqlQuery: savedSql },
  });
  const executor = { execute: jest.fn().mockResolvedValue(SqlDryRunResult.success(42)) };
  const validator = { prepareForSave: jest.fn(async ({ sqlQuery }) => sqlQuery) };
  const resolver = { expandSql: jest.fn().mockResolvedValue('SELECT 1 /* resolved */') };
  const service = new SqlDryRunService(
    { getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart) } as never,
    executor as never,
    { resolveDataMartTableMacro: jest.fn(async (_dm, sql: string) => sql) } as never,
    {
      hasCredentials: jest.fn().mockResolvedValue(true),
      resolve: jest.fn().mockResolvedValue({}),
    } as never,
    { canAccess: jest.fn().mockResolvedValue(true) } as never,
    validator as never,
    resolver as never
  );
  return { service, executor, validator };
}

describe('SqlDryRunService', () => {
  describe('run without a user, as an AI agent calls it', () => {
    it('refuses a reference the saved SQL does not have, before the warehouse sees it', async () => {
      const { service, executor } = createService();

      const result = await service.run(
        new SqlDryRunCommand('dm-1', 'project-1', `SELECT nope FROM ${ref('Hidden', HIDDEN)} h`)
      );

      expect(result).toEqual(
        SqlDryRunResult.failed(
          'Data Mart "Hidden" can be referenced only from the SQL editor, where access to it is checked.'
        )
      );
      expect(executor.execute).not.toHaveBeenCalled();
    });

    it('runs with the references the saved SQL already has', async () => {
      const { service, executor } = createService();

      const result = await service.run(
        new SqlDryRunCommand('dm-1', 'project-1', `SELECT id FROM ${ref('Orders', SAVED)} o`)
      );

      expect(result.isValid).toBe(true);
      expect(executor.execute).toHaveBeenCalledWith(
        DataStorageType.GOOGLE_BIGQUERY,
        {},
        {},
        'SELECT 1 /* resolved */'
      );
    });
  });

  it('runs a new reference from the editor, whose access was checked on request', async () => {
    const { service, executor } = createService();

    const result = await service.run(
      new SqlDryRunCommand(
        'dm-1',
        'project-1',
        `SELECT id FROM ${ref('Hidden', HIDDEN)} h`,
        '',
        [],
        true
      )
    );

    expect(result.isValid).toBe(true);
    expect(executor.execute).toHaveBeenCalled();
  });

  describe('checkReferences', () => {
    it('checks the references as the user who asks for the dry run', async () => {
      const { service, validator } = createService();
      const sql = `SELECT id FROM ${ref('Hidden', HIDDEN)} h`;

      await service.checkReferences(
        new SqlDryRunCommand('dm-1', 'project-1', sql, 'user-1', ['editor'])
      );

      expect(validator.prepareForSave).toHaveBeenCalledWith(
        expect.objectContaining({ sqlQuery: sql, userId: 'user-1', roles: ['editor'] })
      );
    });

    it('fails with the error saving would give', async () => {
      const { service, validator } = createService();
      const denied = new DataMartSqlReferenceException(
        DataMartSqlReferenceErrorCode.ACCESS_DENIED,
        'You do not have access to Data Mart "Hidden".'
      );
      validator.prepareForSave.mockRejectedValueOnce(denied);

      await expect(
        service.checkReferences(
          new SqlDryRunCommand('dm-1', 'project-1', `FROM ${ref('Hidden', HIDDEN)}`, 'user-1')
        )
      ).rejects.toBe(denied);
    });
  });
});
