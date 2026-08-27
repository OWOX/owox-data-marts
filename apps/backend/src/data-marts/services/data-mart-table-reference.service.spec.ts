import {
  DataMartTableReferenceService,
  TableReferenceMemo,
} from './data-mart-table-reference.service';

/**
 * Resolving a SQL-defined Data Mart is a WRITE: it runs `CREATE OR REPLACE VIEW` against the
 * customer's warehouse. Every test here counts that DDL, not cache hits — a schema save that
 * dry-runs a joined formula composes once for the whole metric set and again per metric to
 * attribute a failure, over the same Data Marts each time.
 */
describe('DataMartTableReferenceService — the caller-scoped table reference memo', () => {
  const sqlDataMart = (id: string) => ({
    id,
    projectId: 'proj-1',
    definition: { type: 'sql', sqlQuery: 'SELECT 1' },
  });

  const build = () => {
    const dataMartService = {
      getByIdAndProjectId: jest
        .fn()
        .mockImplementation((id: string) => Promise.resolve(sqlDataMart(id))),
    };
    const createViewService = {
      run: jest
        .fn()
        .mockImplementation((cmd: { viewName: string }) =>
          Promise.resolve({ fullyQualifiedName: `proj.ds.${cmd.viewName}` })
        ),
    };
    return {
      service: new DataMartTableReferenceService(
        dataMartService as never,
        createViewService as never
      ),
      createViewService,
      dataMartService,
    };
  };

  // The control: without a memo the behaviour is unchanged, which is what every existing caller
  // (a report run, a preview, sample data) relies on to get a freshly refreshed view.
  it('refreshes the view on every call when no memo is given', async () => {
    const { service, createViewService } = build();

    await service.resolveTableName('dm-1', 'proj-1');
    await service.resolveTableName('dm-1', 'proj-1');

    expect(createViewService.run).toHaveBeenCalledTimes(2);
  });

  it('refreshes the view once per Data Mart when a memo is shared', async () => {
    const { service, createViewService } = build();
    const memo: TableReferenceMemo = new Map();

    const first = await service.resolveTableName('dm-1', 'proj-1', memo);
    const second = await service.resolveTableName('dm-1', 'proj-1', memo);

    expect(second).toBe(first);
    expect(createViewService.run).toHaveBeenCalledTimes(1);
  });

  it('keeps different Data Marts apart in the same memo', async () => {
    const { service, createViewService } = build();
    const memo: TableReferenceMemo = new Map();

    await service.resolveTableName('dm-1', 'proj-1', memo);
    await service.resolveTableName('dm-orders', 'proj-1', memo);
    await service.resolveTableName('dm-1', 'proj-1', memo);

    expect(createViewService.run).toHaveBeenCalledTimes(2);
  });

  // Memoizing the resolved VALUE rather than the promise would let two in-flight resolutions both
  // miss and both issue the DDL — the exact double write the memo exists to remove.
  it('issues one refresh for concurrent resolutions of the same Data Mart', async () => {
    const { service, createViewService } = build();
    const memo: TableReferenceMemo = new Map();

    await Promise.all([
      service.resolveTableName('dm-1', 'proj-1', memo),
      service.resolveTableName('dm-1', 'proj-1', memo),
    ]);

    expect(createViewService.run).toHaveBeenCalledTimes(1);
  });

  // A warehouse blip must not become permanent for the rest of the save: the failed entry is
  // dropped so a later composition can try again.
  it('does not cache a failed resolution', async () => {
    const { service, createViewService } = build();
    const memo: TableReferenceMemo = new Map();
    createViewService.run.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(service.resolveTableName('dm-1', 'proj-1', memo)).rejects.toThrow('ECONNRESET');
    await expect(service.resolveTableName('dm-1', 'proj-1', memo)).resolves.toBe(
      'proj.ds.view_dm_1'
    );
    expect(createViewService.run).toHaveBeenCalledTimes(2);
  });

  // A non-SQL Data Mart needs no DDL at all, but it is still a repository read per call, and the
  // memo has to be transparent for it either way.
  it('memoizes a table-defined Data Mart without touching the view service', async () => {
    const { service, createViewService, dataMartService } = build();
    dataMartService.getByIdAndProjectId.mockResolvedValue({
      id: 'dm-1',
      projectId: 'proj-1',
      definition: { type: 'table', fullyQualifiedName: 'proj.ds.tbl' },
    });
    const memo: TableReferenceMemo = new Map();

    await service.resolveTableName('dm-1', 'proj-1', memo);
    await service.resolveTableName('dm-1', 'proj-1', memo);

    expect(createViewService.run).not.toHaveBeenCalled();
    expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledTimes(1);
  });
});
