import { Injectable } from '@nestjs/common';
import { BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { BlendedQueryBuilderFacade } from '../data-storage-types/facades/blended-query-builder.facade';
import { Report } from '../entities/report.entity';
import { ResolvedRelationshipChain } from '../data-storage-types/interfaces/blended-query-builder.interface';
import { isQueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { AvailableSourceDto, BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { StorageFieldType } from '../dto/domain/storage-field-type';
import { computeEffectiveType } from '../data-storage-types/field-aggregation';
import { BlendingDecision } from '../dto/domain/blending-decision.dto';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { buildDataMartUrl } from '../../common/helpers/data-mart-url.helper';

@Injectable()
export class BlendedReportDataService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly blendedQueryBuilderFacade: BlendedQueryBuilderFacade,
    private readonly tableReferenceService: DataMartTableReferenceService,
    private readonly publicOriginService: PublicOriginService
  ) {}

  async resolveBlendingDecision(report: Report): Promise<BlendingDecision> {
    const { columnConfig, dataMart } = report;

    if (columnConfig === null || columnConfig === undefined) {
      return { needsBlending: false };
    }

    const blendableSchema = await this.blendableSchemaService.computeBlendableSchema(
      dataMart.id,
      dataMart.projectId
    );

    const blendedFieldsByName = new Map(blendableSchema.blendedFields.map(f => [f.name, f]));
    const filterColumns = (report.filterConfig ?? []).map(f => f.column);
    const referencedColumns = new Set<string>([...columnConfig, ...filterColumns]);
    const hasBlendedColumns = Array.from(referencedColumns).some(col =>
      blendedFieldsByName.has(col)
    );
    const blendedDataHeaders = this.buildBlendedDataHeaders(
      columnConfig,
      blendedFieldsByName,
      dataMart.storage.type
    );

    if (!hasBlendedColumns) {
      return {
        needsBlending: false,
        columnFilter: columnConfig,
        blendedDataHeaders,
      };
    }

    const mainTableReference = await this.tableReferenceService.resolveTableName(
      dataMart.id,
      dataMart.projectId
    );

    const publicOrigin = this.publicOriginService.getPublicOrigin();
    const mainDataMartUrl = buildDataMartUrl(
      publicOrigin,
      dataMart.projectId,
      dataMart.id,
      '/data-setup'
    );

    const allRelationships = await this.relationshipService.findBySourceDataMartId(dataMart.id);
    const chains = await this.buildRelationshipChains(
      columnConfig,
      referencedColumns,
      blendableSchema.blendedFields,
      blendableSchema.availableSources,
      allRelationships,
      dataMart.id,
      dataMart.projectId,
      publicOrigin
    );

    const blendedResult = await this.blendedQueryBuilderFacade.buildBlendedQuery(
      dataMart.storage.type,
      {
        mainTableReference,
        mainDataMartTitle: dataMart.title,
        mainDataMartUrl,
        chains,
        columns: columnConfig,
        filters: report.filterConfig ?? undefined,
        sort: report.sortConfig ?? undefined,
        limit: report.limitConfig ?? undefined,
      }
    );
    const blendedSql = isQueryBuildResult(blendedResult) ? blendedResult.sql : blendedResult;
    const params = isQueryBuildResult(blendedResult) ? blendedResult.params : undefined;

    return {
      needsBlending: true,
      blendedSql,
      params,
      columnFilter: columnConfig,
      blendedDataHeaders,
    };
  }

  private buildBlendedDataHeaders(
    columnConfig: string[],
    blendedFieldsByName: Map<string, BlendedFieldDto>,
    storageType: DataStorageType
  ): ReportDataHeader[] {
    const headers: ReportDataHeader[] = [];
    for (const col of columnConfig) {
      const blendedField = blendedFieldsByName.get(col);
      if (blendedField) {
        const effectiveType = computeEffectiveType(
          blendedField.type as StorageFieldType,
          blendedField.aggregateFunction,
          storageType
        );
        headers.push(
          new ReportDataHeader(
            blendedField.name,
            `${blendedField.outputPrefix} ${blendedField.alias || blendedField.originalFieldName}`,
            blendedField.description || undefined,
            effectiveType,
            blendedField.aggregateFunction
          )
        );
      }
    }
    return headers;
  }

  /**
   * Builds the minimal set of ResolvedRelationshipChain entries needed to satisfy
   * the columns requested in columnConfig.
   *
   * For direct relationships (transitiveDepth === 1), parentAlias is 'main'.
   * For transitive relationships (transitiveDepth > 1), parentAlias is the targetAlias
   * of the preceding relationship in the chain.
   *
   * When a requested field lives at depth ≥ 2 (e.g. A→B→C, C-field requested), ALL
   * ancestor relationships along the aliasPath are also included — otherwise the
   * resulting SQL cannot form a valid join chain (C would try to join directly to main,
   * using joinConditions that reference B's fields).
   */
  private async buildRelationshipChains(
    columnConfig: string[],
    referencedColumns: ReadonlySet<string>,
    blendedFields: BlendedFieldDto[],
    availableSources: AvailableSourceDto[],
    directRelationships: DataMartRelationship[],
    rootDataMartId: string,
    projectId: string,
    publicOrigin: string
  ): Promise<ResolvedRelationshipChain[]> {
    const requestedBlendedFields = blendedFields.filter(f => referencedColumns.has(f.name));

    if (requestedBlendedFields.length === 0) {
      return [];
    }

    // Requesting a field at aliasPath "b.c" requires resolving "b" as well so the join
    // chain is contiguous; otherwise C would try to join directly to main using B's keys.
    const neededPaths = new Set<string>();
    for (const field of requestedBlendedFields) {
      const segments = field.aliasPath.split('.');
      for (let i = 1; i <= segments.length; i++) {
        neededPaths.add(segments.slice(0, i).join('.'));
      }
    }

    const sourceByPath = new Map(availableSources.map(s => [s.aliasPath, s]));
    const neededSources: AvailableSourceDto[] = [];
    for (const path of neededPaths) {
      const src = sourceByPath.get(path);
      if (src) neededSources.push(src);
    }

    const directRelMap = new Map(directRelationships.map(r => [r.id, r]));
    const relationshipsById = new Map(directRelMap);
    const missingIds = Array.from(
      new Set(neededSources.map(src => src.relationshipId).filter(id => !relationshipsById.has(id)))
    );
    if (missingIds.length > 0) {
      const fetched = await this.relationshipService.findByIds(missingIds);
      for (const rel of fetched) {
        relationshipsById.set(rel.id, rel);
      }
    }

    const fieldsByRelId = new Map<string, BlendedFieldDto[]>();
    for (const field of requestedBlendedFields) {
      const bucket = fieldsByRelId.get(field.sourceRelationshipId) ?? [];
      bucket.push(field);
      fieldsByRelId.set(field.sourceRelationshipId, bucket);
    }

    // Parent-first order guarantees dataMartAliasMap has the parent's alias registered
    // by the time we compute parentAlias for a child.
    const sortedSources = [...neededSources].sort((a, b) => a.depth - b.depth);

    const dataMartAliasMap = new Map<string, string>();
    dataMartAliasMap.set(rootDataMartId, 'main');

    const columnConfigSet = new Set(columnConfig);
    const chains: ResolvedRelationshipChain[] = [];
    for (const src of sortedSources) {
      const rel = relationshipsById.get(src.relationshipId);
      if (!rel) continue;

      const parentAlias =
        src.depth === 1 ? 'main' : (dataMartAliasMap.get(rel.sourceDataMart.id) ?? 'main');

      const targetTableReference = await this.tableReferenceService.resolveTableName(
        rel.targetDataMart.id,
        projectId
      );
      const targetDataMartUrl = buildDataMartUrl(
        publicOrigin,
        projectId,
        rel.targetDataMart.id,
        '/data-setup'
      );

      const chainBlendedFields = (fieldsByRelId.get(rel.id) ?? []).map(f => ({
        targetFieldName: f.originalFieldName,
        outputAlias: f.name,
        // Hide fields referenced only by filterConfig — they flow through CTEs so
        // WHERE can reference them, but must not appear in the final SELECT.
        isHidden: f.isHidden || !columnConfigSet.has(f.name),
        aggregateFunction: f.aggregateFunction,
      }));

      chains.push({
        relationship: rel,
        targetTableReference,
        parentAlias,
        blendedFields: chainBlendedFields,
        targetDataMartTitle: rel.targetDataMart.title,
        targetDataMartUrl,
      });

      dataMartAliasMap.set(rel.targetDataMart.id, rel.targetAlias);
    }

    this.assertNoChainCollisions(chains);

    return chains;
  }

  /**
   * Verifies that all chains can co-exist in a single SQL query:
   *  - `targetAlias` must be unique across chains (otherwise we emit two CTEs
   *    with the same name).
   *  - `outputAlias` of every blended field must be unique across all chains
   *    (otherwise the final SELECT has two columns with the same alias).
   *
   * Both classes of conflict are user-fixable misconfigurations rather than
   * platform bugs, so we surface them as `BusinessViolationException` with a
   * pointer to the offending relationships.
   */
  private assertNoChainCollisions(chains: ResolvedRelationshipChain[]): void {
    const aliasOwners = new Map<string, string[]>();
    for (const chain of chains) {
      const owners = aliasOwners.get(chain.relationship.targetAlias) ?? [];
      owners.push(chain.relationship.id);
      aliasOwners.set(chain.relationship.targetAlias, owners);
    }
    for (const [alias, owners] of aliasOwners) {
      if (owners.length > 1) {
        throw new BusinessViolationException(
          `Duplicate CTE name: targetAlias "${alias}" is used by multiple relationships in the join chain. ` +
            `Rename the targetAlias on one of these relationships so each chain produces a unique CTE.`,
          { targetAlias: alias, relationshipIds: owners }
        );
      }
    }

    const outputAliasOwners = new Map<string, string[]>();
    for (const chain of chains) {
      for (const field of chain.blendedFields) {
        const owners = outputAliasOwners.get(field.outputAlias) ?? [];
        owners.push(chain.relationship.id);
        outputAliasOwners.set(field.outputAlias, owners);
      }
    }
    for (const [alias, owners] of outputAliasOwners) {
      if (owners.length > 1) {
        throw new BusinessViolationException(
          `Duplicate output column: outputAlias "${alias}" is produced by multiple chains. ` +
            `Rename one of the conflicting blended fields so each output column has a unique alias.`,
          { outputAlias: alias, relationshipIds: owners }
        );
      }
    }
  }
}
