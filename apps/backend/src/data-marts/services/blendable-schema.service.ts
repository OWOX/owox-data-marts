import { Injectable } from '@nestjs/common';
import {
  AvailableSourceDto,
  BlendableSchemaDto,
  BlendedFieldDto,
} from '../dto/domain/blendable-schema.dto';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartService } from './data-mart.service';
import { DataMartSchema } from '../data-storage-types/data-mart-schema.type';
import { DataMartSchemaFieldStatus } from '../data-storage-types/enums/data-mart-schema-field-status.enum';
import {
  isDateOrTimeFieldType,
  isNumericFieldType,
} from '../data-storage-types/field-type-compatibility';
import { BlendedFieldsConfig, BlendedSource } from '../dto/schemas/blended-fields-config.schema';
import { AggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { FilterConfig } from '../dto/schemas/filter-config.schema';
import { SortConfig } from '../dto/schemas/sort-config.schema';

const DEFAULT_CONFIG: BlendedFieldsConfig = {
  sources: [],
};

function getDefaultAggregateFunction(rawFieldType: string): AggregateFunction {
  if (isNumericFieldType(rawFieldType)) return 'SUM';
  if (isDateOrTimeFieldType(rawFieldType)) return 'MAX';
  return 'STRING_AGG';
}

interface RawSchemaField {
  name: string;
  type: string;
  status?: string;
  alias?: string;
  description?: string;
  fields?: RawSchemaField[];
}

interface FlatSchemaField {
  name: string;
  type: string;
  alias?: string;
  description?: string;
}

export function flattenSchemaFields(fields: RawSchemaField[], prefix = ''): FlatSchemaField[] {
  const result: FlatSchemaField[] = [];
  for (const field of fields) {
    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    if (field.fields && field.fields.length > 0) {
      result.push(...flattenSchemaFields(field.fields, fullName));
    } else {
      result.push({
        name: fullName,
        type: field.type,
        alias: field.alias,
        description: field.description,
      });
    }
  }
  return result;
}

export type AccessFilter = (dmId: string) => Promise<boolean>;

interface CollectContext {
  sourceId: string;
  parentPath: string;
  sourcesByPath: Map<string, BlendedSource>;
  relationshipsBySource: Map<string, DataMartRelationship[]>;
  result: BlendedFieldDto[];
  availableSources: AvailableSourceDto[];
  branchDmIds: Set<string>;
  depth: number;
  accessFilter?: AccessFilter;
  pathByFieldName?: Map<string, string[]>;
  ancestorDmIds?: string[];
}

@Injectable()
export class BlendableSchemaService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService
  ) {}

  async computeBlendableSchema(
    dataMartId: string,
    projectId: string,
    accessFilter?: AccessFilter
  ): Promise<BlendableSchemaDto> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);
    const nativeFields = (dataMart.schema?.fields ?? []).filter(
      f => !f.isHiddenForReporting
    ) as DataMartSchema['fields'];

    const config: BlendedFieldsConfig = dataMart.blendedFieldsConfig ?? DEFAULT_CONFIG;
    const sourcesByPath = new Map(config.sources.map(s => [s.path, s]));

    const allStorageRelationships = await this.relationshipService.findByStorageId(
      dataMart.storage.id,
      projectId
    );
    const relationshipsBySource = new Map<string, DataMartRelationship[]>();
    for (const rel of allStorageRelationships) {
      const list = relationshipsBySource.get(rel.sourceDataMart.id);
      if (list) list.push(rel);
      else relationshipsBySource.set(rel.sourceDataMart.id, [rel]);
    }

    const blendedFields: BlendedFieldDto[] = [];
    const availableSources: AvailableSourceDto[] = [];
    const branchDmIds = new Set<string>([dataMartId]);

    await this.collectBlendedFields({
      sourceId: dataMartId,
      parentPath: '',
      sourcesByPath,
      relationshipsBySource,
      result: blendedFields,
      availableSources,
      branchDmIds,
      depth: 1,
      accessFilter,
    });

    return {
      nativeFields,
      nativeDescription: dataMart.description ?? undefined,
      blendedFields,
      availableSources,
    };
  }

  async findInaccessibleReportRefs(
    report: {
      columnConfig?: string[] | null;
      filterConfig?: FilterConfig;
      sortConfig?: SortConfig;
    },
    dataMartId: string,
    projectId: string,
    accessFilter: AccessFilter
  ): Promise<{ columns: string[]; filters: string[]; sorts: string[] }> {
    const columnColumns = report.columnConfig ?? [];
    const filterColumns = (report.filterConfig ?? []).map(r => r.column);
    const sortColumns = (report.sortConfig ?? []).map(r => r.column);

    const allColumns = [...new Set([...columnColumns, ...filterColumns, ...sortColumns])];
    if (!allColumns.length) return { columns: [], filters: [], sorts: [] };

    const orphans = await this.findInaccessibleColumnRefs(
      allColumns,
      dataMartId,
      projectId,
      accessFilter
    );

    const orphanSet = new Set(orphans);
    return {
      columns: columnColumns.filter(c => orphanSet.has(c)).sort(),
      filters: [...new Set(filterColumns.filter(c => orphanSet.has(c)))].sort(),
      sorts: [...new Set(sortColumns.filter(c => orphanSet.has(c)))].sort(),
    };
  }

  async assertNoInaccessibleReportRefs(
    report: {
      columnConfig?: string[] | null;
      filterConfig?: FilterConfig;
      sortConfig?: SortConfig;
    },
    dataMartId: string,
    projectId: string,
    accessFilter: AccessFilter,
    contextLabel: string
  ): Promise<void> {
    const { columns, filters, sorts } = await this.findInaccessibleReportRefs(
      report,
      dataMartId,
      projectId,
      accessFilter
    );

    if (!columns.length && !filters.length && !sorts.length) return;

    const parts: string[] = [];
    if (columns.length)
      parts.push(`columns reference inaccessible data marts: ${columns.join(', ')}`);
    if (filters.length)
      parts.push(`filters reference inaccessible data marts: ${filters.join(', ')}`);
    if (sorts.length) parts.push(`sorts reference inaccessible data marts: ${sorts.join(', ')}`);

    throw new BusinessViolationException(`${contextLabel}: ${parts.join('; ')}`);
  }

  async findInaccessibleColumnRefs(
    columnConfig: string[],
    dataMartId: string,
    projectId: string,
    accessFilter: AccessFilter
  ): Promise<string[]> {
    if (!columnConfig.length) return [];

    const dataMart = await this.dataMartService.getByIdAndProjectId(dataMartId, projectId);

    const nativeSchemaFields = (dataMart.schema?.fields ?? []).filter(f => !f.isHiddenForReporting);
    const nativeFieldNames = new Set(
      flattenSchemaFields(nativeSchemaFields as RawSchemaField[]).map(f => f.name)
    );

    const allStorageRelationships = await this.relationshipService.findByStorageId(
      dataMart.storage.id,
      projectId
    );
    const relationshipsBySource = new Map<string, DataMartRelationship[]>();
    for (const rel of allStorageRelationships) {
      const list = relationshipsBySource.get(rel.sourceDataMart.id);
      if (list) list.push(rel);
      else relationshipsBySource.set(rel.sourceDataMart.id, [rel]);
    }

    const pathByFieldName = new Map<string, string[]>();
    await this.collectBlendedFields({
      sourceId: dataMartId,
      parentPath: '',
      sourcesByPath: new Map(
        (dataMart.blendedFieldsConfig ?? DEFAULT_CONFIG).sources.map(s => [s.path, s])
      ),
      relationshipsBySource,
      result: [],
      availableSources: [],
      branchDmIds: new Set<string>([dataMartId]),
      depth: 1,
      pathByFieldName,
      ancestorDmIds: [],
    });

    const orphans: string[] = [];
    for (const col of columnConfig) {
      if (nativeFieldNames.has(col)) continue;

      const path = pathByFieldName.get(col);
      if (!path) {
        orphans.push(col);
        continue;
      }

      let pathInaccessible = false;
      for (const dmId of path) {
        const accessible = await accessFilter(dmId);
        if (!accessible) {
          pathInaccessible = true;
          break;
        }
      }
      if (pathInaccessible) orphans.push(col);
    }

    return orphans.sort();
  }

  private async collectBlendedFields(ctx: CollectContext): Promise<void> {
    const relationships = ctx.relationshipsBySource.get(ctx.sourceId) ?? [];

    for (const rel of relationships) {
      if (!rel.joinConditions || rel.joinConditions.length === 0) continue;

      if (!rel.targetDataMart) {
        throw new BusinessViolationException(
          `Relationship "${rel.targetAlias ?? rel.id}" (id=${rel.id}) targets a data mart that has been deleted. ` +
            `Remove this relationship or restore the target data mart before running reports that depend on it.`,
          { relationshipId: rel.id, targetAlias: rel.targetAlias }
        );
      }

      if (rel.targetDataMart.status !== DataMartStatus.PUBLISHED) continue;

      if (ctx.branchDmIds.has(rel.targetDataMart.id)) continue;

      if (ctx.accessFilter) {
        const allowed = await ctx.accessFilter(rel.targetDataMart.id);
        if (!allowed) continue;
      }

      const currentPath = ctx.parentPath ? `${ctx.parentPath}.${rel.targetAlias}` : rel.targetAlias;

      const sourceConfig = ctx.sourcesByPath.get(currentPath);
      const isExcluded = sourceConfig?.isExcluded === true;

      const targetSchemaFields = (rel.targetDataMart.schema?.fields ?? []).filter(
        f => !f.isHiddenForReporting
      );
      const flatTargetFields = flattenSchemaFields(targetSchemaFields);

      const sqlPrefix = currentPath.replace(/\./g, '_');
      // SQL-safe: alias segments validated against ^[a-z0-9_]+$; displayPrefix is free-form and must never flow into SQL identifiers.
      const displayPrefix = sourceConfig?.alias ?? rel.targetDataMart.title;

      const availableSource = new AvailableSourceDto();
      availableSource.aliasPath = currentPath;
      availableSource.title = rel.targetDataMart.title;
      availableSource.description = rel.targetDataMart.description ?? undefined;
      availableSource.defaultAlias = displayPrefix;
      availableSource.depth = ctx.depth;
      availableSource.fieldCount = flatTargetFields.length;
      availableSource.isIncluded = !isExcluded;
      availableSource.relationshipId = rel.id;
      availableSource.dataMartId = rel.targetDataMart.id;
      ctx.availableSources.push(availableSource);

      const fieldPath = [...(ctx.ancestorDmIds ?? []), rel.targetDataMart.id];

      for (const field of flatTargetFields) {
        const fieldOverride = sourceConfig?.fields?.[field.name];
        const fieldName = `${sqlPrefix}__${field.name.replace(/\./g, '_')}`;

        if (ctx.pathByFieldName) {
          ctx.pathByFieldName.set(fieldName, fieldPath);
        }

        const dto = new BlendedFieldDto();
        dto.name = fieldName;
        dto.aliasPath = currentPath;
        dto.outputPrefix = displayPrefix;
        dto.sourceRelationshipId = rel.id;
        dto.sourceDataMartId = rel.targetDataMart.id;
        dto.sourceDataMartTitle = rel.targetDataMart.title;
        dto.targetAlias = rel.targetAlias;
        dto.originalFieldName = field.name;
        dto.type = field.type;
        dto.alias = fieldOverride?.alias ?? field.alias ?? '';
        dto.description = field.description ?? '';
        dto.isHidden = fieldOverride?.isHidden ?? false;
        dto.aggregateFunction =
          fieldOverride?.aggregateFunction ?? getDefaultAggregateFunction(field.type);
        dto.transitiveDepth = ctx.depth;

        ctx.result.push(dto);
      }

      await this.collectBlendedFields({
        ...ctx,
        sourceId: rel.targetDataMart.id,
        parentPath: currentPath,
        branchDmIds: new Set([...ctx.branchDmIds, rel.targetDataMart.id]),
        depth: ctx.depth + 1,
        ancestorDmIds: fieldPath,
      });
    }
  }
}
