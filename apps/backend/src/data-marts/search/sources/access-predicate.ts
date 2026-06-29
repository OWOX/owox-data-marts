import { Repository, SelectQueryBuilder } from 'typeorm';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from '../../services/context/context-access.service';
import type {
  AccessPredicate,
  AccessPredicateProvider,
  SourceAccessScope,
} from './indexable-source.port';

export function resolveRoleScope(
  accessScope: SourceAccessScope,
  projectId: string,
  contextAccessService: ContextAccessService
): Promise<RoleScope> {
  if (accessScope.roles.includes('admin')) {
    return Promise.resolve(RoleScope.ENTIRE_PROJECT);
  }
  return contextAccessService.getRoleScope(accessScope.userId, projectId);
}

export function toRawBindableParams(params: Record<string, unknown>): Record<string, unknown> {
  const { projectId: _projectId, ...rest } = params;
  const coerced: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    coerced[key] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }
  return coerced;
}

export interface EntityAccessPredicateConfig<TEntity extends object> {
  repo: Repository<TEntity>;
  joinAlias: string;
  joinSql: (indexAlias: string) => string;
  extraClauses: string[];
  extraParameters?: Record<string, unknown>;
  applyFilter: (
    qb: SelectQueryBuilder<TEntity>,
    opts: {
      projectId: string;
      userId: string;
      roles: string[];
      roleScope: RoleScope;
    }
  ) => void;
  contextAccessService: ContextAccessService;
}

export class EntityAccessPredicateProvider<
  TEntity extends object,
> implements AccessPredicateProvider {
  constructor(private readonly cfg: EntityAccessPredicateConfig<TEntity>) {}

  async build(
    indexAlias: string,
    projectId: string,
    accessScope?: SourceAccessScope
  ): Promise<AccessPredicate> {
    const joinSql = this.cfg.joinSql(indexAlias);
    const clauses = [...this.cfg.extraClauses];
    const parameters: Record<string, unknown> = { ...this.cfg.extraParameters };

    const visibility = await this.buildVisibilityFragment(projectId, accessScope);
    if (visibility) {
      clauses.push(visibility.whereSql);
      Object.assign(parameters, visibility.parameters);
    }

    return { joinSql, whereSql: clauses.join(' AND '), parameters };
  }

  private async buildVisibilityFragment(
    projectId: string,
    accessScope?: SourceAccessScope
  ): Promise<{ whereSql: string; parameters: Record<string, unknown> } | null> {
    if (!accessScope) return null;

    const roleScope = await resolveRoleScope(accessScope, projectId, this.cfg.contextAccessService);

    const qb = this.cfg.repo.createQueryBuilder(this.cfg.joinAlias);
    this.cfg.applyFilter(qb, {
      projectId,
      userId: accessScope.userId,
      roles: accessScope.roles,
      roleScope,
    });

    const { wheres } = qb.expressionMap;
    if (wheres.length === 0) return null;

    return {
      whereSql: wheres.map(w => w.condition).join(' AND '),
      parameters: toRawBindableParams(qb.getParameters()),
    };
  }
}
