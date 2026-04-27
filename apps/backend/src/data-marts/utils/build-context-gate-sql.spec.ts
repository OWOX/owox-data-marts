import { buildContextGateSql } from './build-context-gate-sql';

describe('buildContextGateSql', () => {
  it('produces an OR-EXISTS clause that compares roleScope to the entire-project sentinel', () => {
    const sql = buildContextGateSql({
      joinTable: 'data_mart_contexts',
      entityIdColumn: 'data_mart_id',
      entityAlias: 'dm',
    });

    expect(sql).toContain(':roleScope = :entireProjectScope');
    expect(sql).toContain('OR EXISTS');
  });

  it('substitutes the join-table name into the EXISTS subquery', () => {
    const sql = buildContextGateSql({
      joinTable: 'storage_contexts',
      entityIdColumn: 'storage_id',
      entityAlias: 's',
    });

    expect(sql).toContain('FROM storage_contexts jc');
    expect(sql).toContain('jc.storage_id = s.id');
  });

  it('joins member_role_contexts and context, gated by deletedAt IS NULL', () => {
    // The deletedAt guard is the historical bug magnet — six list services
    // used to inline this exact clause and a missed guard would silently
    // expose soft-deleted contexts. Pin the constraint to the helper.
    const sql = buildContextGateSql({
      joinTable: 'destination_contexts',
      entityIdColumn: 'destination_id',
      entityAlias: 'd',
    });

    expect(sql).toContain('JOIN member_role_contexts mrc ON mrc.context_id = jc.context_id');
    expect(sql).toContain('JOIN context c ON c.id = jc.context_id AND c.deletedAt IS NULL');
  });

  it('binds the caller via :userId and :projectId named parameters', () => {
    const sql = buildContextGateSql({
      joinTable: 'data_mart_contexts',
      entityIdColumn: 'data_mart_id',
      entityAlias: 'dataMart',
    });

    expect(sql).toContain('mrc.user_id = :userId');
    expect(sql).toContain('mrc.project_id = :projectId');
  });

  it('respects the entity alias in the EXISTS row predicate (so dataMart.id ≠ dm.id)', () => {
    const dm = buildContextGateSql({
      joinTable: 'data_mart_contexts',
      entityIdColumn: 'data_mart_id',
      entityAlias: 'dm',
    });
    const dataMart = buildContextGateSql({
      joinTable: 'data_mart_contexts',
      entityIdColumn: 'data_mart_id',
      entityAlias: 'dataMart',
    });

    expect(dm).toContain('= dm.id');
    expect(dm).not.toContain('= dataMart.id');
    expect(dataMart).toContain('= dataMart.id');
    expect(dataMart).not.toContain('= dm.id');
  });
});
