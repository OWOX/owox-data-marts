import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { RoleScope } from '../enums/role-scope.enum';
import { buildContextGateSql } from './build-context-gate-sql';

export interface DataDestinationVisibilityFilterOptions {
  readonly destinationAlias: string;
  readonly projectId: string;
  readonly userId?: string;
  readonly roles?: string[];
  readonly roleScope?: RoleScope;
}

export function applyDataDestinationVisibilityFilter<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  options: DataDestinationVisibilityFilterOptions
): SelectQueryBuilder<T> {
  const isAdmin = options.roles?.includes('admin');
  if (isAdmin || !options.userId) {
    return qb;
  }

  const roleScope = options.roleScope ?? RoleScope.ENTIRE_PROJECT;
  const { destinationAlias } = options;
  const contextGate = buildContextGateSql({
    joinTable: 'destination_contexts',
    entityIdColumn: 'destination_id',
    entityAlias: destinationAlias,
  });

  return qb.andWhere(
    `(
      EXISTS (SELECT 1 FROM destination_owners o WHERE o.destination_id = ${destinationAlias}.id AND o.user_id = :userId)
      OR (
        (${destinationAlias}.availableForUse = :isTrue OR ${destinationAlias}.availableForMaintenance = :isTrue)
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
