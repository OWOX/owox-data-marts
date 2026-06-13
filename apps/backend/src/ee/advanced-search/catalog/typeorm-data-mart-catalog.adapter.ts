import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataMart } from '../../../data-marts/entities/data-mart.entity';
import { Context } from '../../../data-marts/entities/context.entity';
import { DataMartContext } from '../../../data-marts/entities/data-mart-context.entity';
import { DataMartRelationship } from '../../../data-marts/entities/data-mart-relationship.entity';
import { DataMartStatus } from '../../../data-marts/enums/data-mart-status.enum';
import { DataMartSchemaFieldStatus } from '../../../data-marts/data-storage-types/enums/data-mart-schema-field-status.enum';
import { RoleScope } from '../../../data-marts/enums/role-scope.enum';
import { ContextAccessService } from '../../../data-marts/services/context/context-access.service';
import { applyDataMartVisibilityFilter } from '../../../data-marts/utils/apply-data-mart-visibility-filter';
import type {
  DataMartAccessScope,
  DataMartCatalogPort,
  RelationshipEdge,
  SearchableDataMart,
} from './data-mart-catalog.port';

type SchemaFieldLike = {
  name: string;
  alias?: string;
  status?: string;
  isHiddenForReporting?: boolean;
  fields?: SchemaFieldLike[];
};

function collectFieldLabels(fields: SchemaFieldLike[]): string[] {
  const labels: string[] = [];
  for (const field of fields) {
    if (field.isHiddenForReporting) continue;
    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;
    labels.push(field.alias ?? field.name);
    if (field.fields?.length) {
      labels.push(...collectFieldLabels(field.fields));
    }
  }
  return labels;
}

@Injectable()
export class TypeOrmDataMartCatalogAdapter implements DataMartCatalogPort {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>,

    @InjectRepository(DataMartContext)
    private readonly dataMartContextRepo: Repository<DataMartContext>,

    @InjectRepository(Context)
    private readonly contextRepo: Repository<Context>,

    @InjectRepository(DataMartRelationship)
    private readonly relationshipRepo: Repository<DataMartRelationship>,

    private readonly contextAccessService: ContextAccessService
  ) {}

  async listSearchable(
    projectId?: string,
    accessScope?: DataMartAccessScope
  ): Promise<SearchableDataMart[]> {
    const qb = this.dataMartRepo
      .createQueryBuilder('dm')
      .where('dm.status = :status', { status: DataMartStatus.PUBLISHED })
      .andWhere('dm.deletedAt IS NULL');
    if (projectId) {
      qb.andWhere('dm.projectId = :projectId', { projectId });
    }
    if (accessScope && projectId) {
      const roleScope = await this.resolveRoleScope(accessScope, projectId);
      applyDataMartVisibilityFilter(qb, {
        dataMartAlias: 'dm',
        projectId,
        userId: accessScope.userId,
        roles: accessScope.roles,
        roleScope,
      });
    }

    const marts = await qb.getMany();

    if (marts.length === 0) return [];

    const martIds = marts.map(m => m.id);
    const contextsByMartId = await this.loadContextsByMartIds(martIds);

    return marts.map(mart => ({
      id: mart.id,
      projectId: mart.projectId,
      title: mart.title,
      description: mart.description ?? null,
      fieldNames: mart.schema?.fields
        ? collectFieldLabels(mart.schema.fields as SchemaFieldLike[])
        : [],
      contexts: (contextsByMartId.get(mart.id) ?? []).filter(
        c => c.name.trim() !== '' || c.content.trim() !== ''
      ),
      modifiedAt: mart.modifiedAt,
    }));
  }

  async listRelationships(projectId: string): Promise<RelationshipEdge[]> {
    const relationships = await this.relationshipRepo.find({ where: { projectId } });
    return relationships.map(r => ({
      sourceDataMartId: r.sourceDataMart.id,
      targetDataMartId: r.targetDataMart.id,
    }));
  }

  async listLiveIds(projectId?: string): Promise<Set<string>> {
    const where: Record<string, unknown> = { status: DataMartStatus.PUBLISHED };
    if (projectId) where['projectId'] = projectId;

    const marts = await this.dataMartRepo.find({ where, select: { id: true } });
    return new Set(marts.map(m => m.id));
  }

  private async resolveRoleScope(
    accessScope: DataMartAccessScope,
    projectId: string
  ): Promise<RoleScope> {
    if (accessScope.roles.includes('admin')) {
      return RoleScope.ENTIRE_PROJECT;
    }
    return this.contextAccessService.getRoleScope(accessScope.userId, projectId);
  }

  private async loadContextsByMartIds(
    martIds: string[]
  ): Promise<Map<string, { name: string; content: string }[]>> {
    const joins = await this.dataMartContextRepo
      .createQueryBuilder('dmc')
      .where('dmc.dataMartId IN (:...ids)', { ids: martIds })
      .getMany();

    if (joins.length === 0) return new Map();

    const contextIds = [...new Set(joins.map(j => j.contextId))];
    const contexts = await this.contextRepo
      .createQueryBuilder('ctx')
      .where('ctx.id IN (:...ids)', { ids: contextIds })
      .andWhere('ctx.deletedAt IS NULL')
      .getMany();

    const contextMap = new Map(contexts.map(c => [c.id, c]));

    const result = new Map<string, { name: string; content: string }[]>();
    for (const join of joins) {
      const ctx = contextMap.get(join.contextId);
      if (!ctx) continue;
      const entry = { name: ctx.name ?? '', content: ctx.description ?? '' };
      const existing = result.get(join.dataMartId) ?? [];
      existing.push(entry);
      result.set(join.dataMartId, existing);
    }
    return result;
  }
}
