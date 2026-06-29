import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { RoleScope } from '../enums/role-scope.enum';
import { buildContextGateSql } from './build-context-gate-sql';

export interface DataStorageVisibilityFilterOptions {
  readonly storageAlias: string;
  readonly projectId: string;
  readonly userId?: string;
  readonly roles?: string[];
  readonly roleScope?: RoleScope;
}

export function applyDataStorageVisibilityFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  options: DataStorageVisibilityFilterOptions
): SelectQueryBuilder<T> {
  const isAdmin = options.roles?.includes('admin');
  if (isAdmin || !options.userId) {
    return qb;
  }

  const isEditor = options.roles?.includes('editor');
  const { storageAlias } = options;

  if (!isEditor) {
    return qb.andWhere(
      `EXISTS (SELECT 1 FROM storage_owners o WHERE o.storage_id = ${storageAlias}.id AND o.user_id = :userId)`,
      { userId: options.userId }
    );
  }

  const roleScope = options.roleScope ?? RoleScope.ENTIRE_PROJECT;
  const contextGate = buildContextGateSql({
    joinTable: 'storage_contexts',
    entityIdColumn: 'storage_id',
    entityAlias: storageAlias,
  });

  return qb.andWhere(
    `(
      EXISTS (SELECT 1 FROM storage_owners o WHERE o.storage_id = ${storageAlias}.id AND o.user_id = :userId)
      OR (
        (${storageAlias}.availableForUse = :isTrue OR ${storageAlias}.availableForMaintenance = :isTrue)
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
