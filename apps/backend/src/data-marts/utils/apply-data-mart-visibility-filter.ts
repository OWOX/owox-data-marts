import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { RoleScope } from '../enums/role-scope.enum';
import { buildContextGateSql } from './build-context-gate-sql';

export interface DataMartVisibilityFilterOptions {
  readonly dataMartAlias: string;
  readonly projectId: string;
  readonly userId?: string;
  readonly roles?: string[];
  readonly roleScope?: RoleScope;
}

export function applyDataMartVisibilityFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  options: DataMartVisibilityFilterOptions
): SelectQueryBuilder<T> {
  const isAdmin = options.roles?.includes('admin');
  if (isAdmin || !options.userId) {
    return qb;
  }

  const isEditor = options.roles?.includes('editor');
  const roleScope = options.roleScope ?? RoleScope.ENTIRE_PROJECT;
  const { dataMartAlias } = options;
  const contextGate = buildContextGateSql({
    joinTable: 'data_mart_contexts',
    entityIdColumn: 'data_mart_id',
    entityAlias: dataMartAlias,
  });
  const sharedClause = isEditor
    ? `(${dataMartAlias}.availableForReporting = :isTrue OR ${dataMartAlias}.availableForMaintenance = :isTrue)`
    : `${dataMartAlias}.availableForReporting = :isTrue`;

  return qb.andWhere(
    `(
      EXISTS (SELECT 1 FROM data_mart_technical_owners t WHERE t.data_mart_id = ${dataMartAlias}.id AND t.user_id = :userId)
      OR EXISTS (SELECT 1 FROM data_mart_business_owners b WHERE b.data_mart_id = ${dataMartAlias}.id AND b.user_id = :userId)
      OR (
        ${sharedClause}
        AND ${contextGate}
      )
    )`,
    {
      userId: options.userId,
      isTrue: true,
      roleScope,
      entireProjectScope: RoleScope.ENTIRE_PROJECT,
      projectId: options.projectId,
    }
  );
}
