import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';
import type {
  DataMartCatalogPort,
  RelationshipEdge,
  SearchableDataMartField,
  SearchableDataMart,
} from './data-mart-catalog.port';
import type { PageCursor, SearchablePage } from '../sources/indexable-source.port';
import { buildKeysetWhere, nextPageCursor } from '../sources/indexable-source.port';
import { buildDataMartScoringDescriptor } from './data-mart-scoring-descriptor.builder';

type SchemaFieldLike = {
  name: string;
  alias?: string;
  description?: string;
  status?: string;
  isHiddenForReporting?: boolean;
  fields?: SchemaFieldLike[];
};

type SearchableDataMartProjection = Pick<
  DataMart,
  'id' | 'projectId' | 'title' | 'description' | 'schema' | 'status' | 'modifiedAt'
>;

type SearchableDataMartPageRow = Pick<DataMart, 'id' | 'createdAt'>;

const DATA_MART_SEARCHABLE_SELECT = {
  id: true,
  projectId: true,
  title: true,
  description: true,
  schema: true,
  status: true,
  modifiedAt: true,
} satisfies Record<keyof SearchableDataMartProjection, true>;

const DATA_MART_SEARCHABLE_PAGE_SELECT = {
  id: true,
  createdAt: true,
} satisfies Record<keyof SearchableDataMartPageRow, true>;

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

function nonBlankOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function collectFieldDetails(fields: SchemaFieldLike[], prefix = ''): SearchableDataMartField[] {
  const details: SearchableDataMartField[] = [];
  for (const field of fields) {
    if (field.isHiddenForReporting) continue;
    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;

    const name = prefix ? `${prefix}.${field.name}` : field.name;
    details.push({
      name,
      alias: nonBlankOrNull(field.alias),
      description: nonBlankOrNull(field.description),
    });

    if (field.fields?.length) {
      details.push(...collectFieldDetails(field.fields, name));
    }
  }
  return details;
}

@Injectable()
export class TypeOrmDataMartCatalogAdapter implements DataMartCatalogPort {
  constructor(
    @InjectRepository(DataMart)
    private readonly dataMartRepo: Repository<DataMart>,

    @InjectRepository(DataMartRelationship)
    private readonly relationshipRepo: Repository<DataMartRelationship>
  ) {}

  async listSearchablePage(
    projectId: string,
    cursor: PageCursor | null,
    limit: number
  ): Promise<SearchablePage> {
    const where = buildKeysetWhere<DataMart>({ projectId, deletedAt: IsNull() }, cursor, 'DESC');

    const pageRows: SearchableDataMartPageRow[] = await this.dataMartRepo.find({
      where,
      select: DATA_MART_SEARCHABLE_PAGE_SELECT,
      loadEagerRelations: false,
      // Keep this aligned with idx_dm_project_deleted_created for a covering page query.
      order: { createdAt: 'DESC', id: 'ASC' },
      take: limit,
    });
    if (pageRows.length === 0) return { descriptors: [], nextCursor: null };

    const pageIds = pageRows.map(m => m.id);
    const marts: SearchableDataMartProjection[] = await this.dataMartRepo.find({
      // Re-check scope in case a mart changes between page selection and hydration.
      where: { id: In(pageIds), projectId, deletedAt: IsNull() },
      select: DATA_MART_SEARCHABLE_SELECT,
      loadEagerRelations: false,
    });
    const martById = new Map(marts.map(mart => [mart.id, mart]));
    const searchableMarts = pageIds
      .map(id => martById.get(id))
      .filter((mart): mart is SearchableDataMartProjection => mart !== undefined)
      .map(mart => this.toSearchable(mart));
    const searchableMartIds = searchableMarts.map(m => m.id);

    const edges = await this.listOutboundEdgesFor(searchableMartIds);
    const outboundEdgesBySourceId = new Map<string, RelationshipEdge[]>();
    for (const edge of edges) {
      const existing = outboundEdgesBySourceId.get(edge.sourceDataMartId) ?? [];
      existing.push(edge);
      outboundEdgesBySourceId.set(edge.sourceDataMartId, existing);
    }

    const targetIds = edges
      .map(e => e.targetDataMartId)
      .filter(id => !searchableMartIds.includes(id));
    const uniqueTargetIds = [...new Set(targetIds)];
    const targetMarts: SearchableDataMart[] = [];
    if (uniqueTargetIds.length > 0) {
      const targetEntities = await this.dataMartRepo
        .createQueryBuilder('dm')
        .where('dm.id IN (:...ids)', { ids: uniqueTargetIds })
        .andWhere('dm.deletedAt IS NULL')
        .getMany();

      for (const tm of targetEntities) {
        targetMarts.push(this.toSearchable(tm));
      }
    }

    const martsById = new Map<string, SearchableDataMart>();
    for (const m of searchableMarts) martsById.set(m.id, m);
    for (const m of targetMarts) martsById.set(m.id, m);

    const descriptors = searchableMarts.map(mart =>
      buildDataMartScoringDescriptor(mart, outboundEdgesBySourceId, martsById)
    );

    return { descriptors, nextCursor: nextPageCursor(pageRows, limit) };
  }

  async loadSearchable(entityId: string): Promise<SearchableDataMart | null> {
    const mart = await this.dataMartRepo
      .createQueryBuilder('dm')
      .where('dm.id = :id', { id: entityId })
      .andWhere('dm.deletedAt IS NULL')
      .getOne();
    if (!mart) return null;

    return this.toSearchable(mart);
  }

  private toSearchable(mart: SearchableDataMartProjection): SearchableDataMart {
    return {
      id: mart.id,
      projectId: mart.projectId,
      title: mart.title,
      description: mart.description ?? null,
      fieldNames: mart.schema?.fields
        ? collectFieldLabels(mart.schema.fields as SchemaFieldLike[])
        : [],
      fieldDetails: mart.schema?.fields
        ? collectFieldDetails(mart.schema.fields as SchemaFieldLike[])
        : [],
      modifiedAt: mart.modifiedAt,
      isDraft: mart.status === DataMartStatus.DRAFT,
    };
  }

  async listOutboundEdges(sourceDataMartId: string): Promise<RelationshipEdge[]> {
    const relationships = await this.relationshipRepo.find({
      where: { sourceDataMart: { id: sourceDataMartId } },
    });
    return relationships.map(r => ({
      sourceDataMartId: r.sourceDataMart.id,
      targetDataMartId: r.targetDataMart.id,
    }));
  }

  async listOutboundEdgesFor(sourceIds: string[]): Promise<RelationshipEdge[]> {
    if (sourceIds.length === 0) return [];
    const rows: Array<{ sourceDataMartId: string; targetDataMartId: string }> =
      await this.relationshipRepo
        .createQueryBuilder('rel')
        .innerJoin('rel.sourceDataMart', 'src')
        .innerJoin('rel.targetDataMart', 'tgt')
        .select('src.id', 'sourceDataMartId')
        .addSelect('tgt.id', 'targetDataMartId')
        .where('src.id IN (:...ids)', { ids: sourceIds })
        .getRawMany();
    return rows.map(r => ({
      sourceDataMartId: r.sourceDataMartId,
      targetDataMartId: r.targetDataMartId,
    }));
  }

  async listProjectIds(): Promise<string[]> {
    const rows: { projectId: string }[] = await this.dataMartRepo
      .createQueryBuilder('dm')
      .select('DISTINCT dm.projectId', 'projectId')
      .where('dm.deletedAt IS NULL')
      .getRawMany();
    return rows.map(r => r.projectId);
  }
}
