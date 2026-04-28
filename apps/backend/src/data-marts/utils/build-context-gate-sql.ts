/**
 * Returns the SQL fragment that gates shared, non-owner access for a row of
 * the given parent entity by the caller's `member_role_contexts` set.
 *
 * Six list paths (data-mart, data-storage, data-destination, reports-TU,
 * reports-BU, data-mart.findByProjectIdForList × TU/BU) used to inline this
 * exact eight-line clause. Centralizing it here means the
 * `c.deletedAt IS NULL` constraint cannot quietly rot in five of six sites.
 *
 * Caller provides the named parameters via the existing
 * `andWhere(sql, parameters)` call — this function just produces the
 * fragment, so SQL parameter binding is unchanged.
 *
 * Required parameters in the surrounding `andWhere` parameters bag:
 *   - `roleScope` — the caller's RoleScope value
 *   - `entireProjectScope` — typically RoleScope.ENTIRE_PROJECT
 *   - `userId` — caller user id
 *   - `projectId` — caller project id
 */
export interface ContextGateConfig {
  /** Join table name, e.g. `destination_contexts`. */
  readonly joinTable: string;
  /** FK column on the join table referencing the parent row, e.g. `destination_id`. */
  readonly entityIdColumn: string;
  /** Alias used for the parent table in the surrounding SELECT, e.g. `d`. */
  readonly entityAlias: string;
}

export function buildContextGateSql(cfg: ContextGateConfig): string {
  return `(
    :roleScope = :entireProjectScope
    OR EXISTS (
      SELECT 1 FROM ${cfg.joinTable} jc
      JOIN member_role_contexts mrc ON mrc.context_id = jc.context_id
      JOIN context c ON c.id = jc.context_id AND c.deletedAt IS NULL
      WHERE jc.${cfg.entityIdColumn} = ${cfg.entityAlias}.id
      AND mrc.user_id = :userId AND mrc.project_id = :projectId
    )
  )`;
}
