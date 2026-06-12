import { Injectable } from '@nestjs/common';
import { BlendableSchemaAccessor, BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { BlendedQueryBuilderFacade } from '../data-storage-types/facades/blended-query-builder.facade';
import { ReportLike } from '../dto/domain/report-like-read-plan';
import {
  BlendedColumnTypes,
  ResolvedRelationshipChain,
} from '../data-storage-types/interfaces/blended-query-builder.interface';
import { isQueryBuildResult } from '../data-storage-types/interfaces/data-mart-query-builder.interface';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import {
  AvailableSourceDto,
  BlendableSchemaDto,
  BlendedFieldDto,
} from '../dto/domain/blendable-schema.dto';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { StorageFieldType } from '../dto/domain/storage-field-type';
import { computeEffectiveType } from '../data-storage-types/field-aggregation';
import { BlendingDecision } from '../dto/domain/blending-decision.dto';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import {
  collectSchemaFieldPaths,
  collectSchemaFieldPathTypes,
} from '../data-storage-types/data-mart-schema.utils';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { buildDataMartUrl } from '../../common/helpers/data-mart-url.helper';
import { UserProjectionsFetcherService } from './user-projections-fetcher.service';
import { throwDisconnectedReportColumnsError } from '../errors/disconnected-report-columns.error';

@Injectable()
export class BlendedReportDataService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly blendedQueryBuilderFacade: BlendedQueryBuilderFacade,
    private readonly tableReferenceService: DataMartTableReferenceService,
    private readonly publicOriginService: PublicOriginService,
    private readonly outputControlsValidator: OutputControlsValidatorService,
    private readonly userProjectionsFetcher: UserProjectionsFetcherService
  ) {}

  async resolveBlendingDecision(
    report: ReportLike,
    accessor: BlendableSchemaAccessor
  ): Promise<BlendingDecision> {
    const { columnConfig, dataMart } = report;

    // Single chokepoint for both /generated-sql and the run path — catches schema drift since save.
    await this.outputControlsValidator.validateForReport({
      storageType: dataMart.storage.type,
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
      columnConfig: columnConfig ?? null,
      filterConfig: report.filterConfig ?? null,
      sortConfig: report.sortConfig ?? null,
      limitConfig: report.limitConfig ?? null,
      accessor,
    });

    const postJoinFilterColumns: string[] = [];
    const preJoinAliasPaths = new Set<string>();
    for (const rule of report.filterConfig ?? []) {
      if (rule.placement === 'pre-join' && rule.aliasPath) {
        preJoinAliasPaths.add(rule.aliasPath);
      } else {
        postJoinFilterColumns.push(rule.column);
      }
    }
    const sortColumns = (report.sortConfig ?? []).map(s => s.column);
    const hasPreJoinFilters = preJoinAliasPaths.size > 0;

    if (columnConfig === null || columnConfig === undefined) {
      // Without an explicit column config the native projection is "all native
      // columns". A blended SQL build needs an explicit column list, so any
      // blended reference (post-join filter / sort / pre-join slice) while
      // columnConfig is null is malformed — reject early instead of falling
      // through to a native query that can't resolve the blended column.
      if (postJoinFilterColumns.length === 0 && sortColumns.length === 0 && !hasPreJoinFilters) {
        return { needsBlending: false };
      }

      const blendableSchema = await this.blendableSchemaService.computeBlendableSchema(
        dataMart.id,
        dataMart.projectId,
        accessor
      );
      const blendedFieldsByName = new Map(blendableSchema.blendedFields.map(f => [f.name, f]));
      const blendedRefs = [...postJoinFilterColumns, ...sortColumns].filter(c =>
        blendedFieldsByName.has(c)
      );
      if (blendedRefs.length === 0 && !hasPreJoinFilters) {
        return { needsBlending: false };
      }

      throw new BusinessViolationException(
        'Cannot build report SQL: blended output controls require an explicit column selection',
        {
          blendedFilterOrSortColumns: blendedRefs,
          preJoinAliasPaths: Array.from(preJoinAliasPaths),
        }
      );
    }

    const blendableSchema = await this.blendableSchemaService.computeBlendableSchema(
      dataMart.id,
      dataMart.projectId,
      accessor
    );

    const blendedFieldsByName = new Map(blendableSchema.blendedFields.map(f => [f.name, f]));
    this.assertNoOrphanedColumnReferences(dataMart, columnConfig, blendedFieldsByName);

    const referencedColumns = new Set<string>([
      ...columnConfig,
      ...postJoinFilterColumns,
      ...sortColumns,
    ]);
    const hasBlendedColumns = Array.from(referencedColumns).some(col =>
      blendedFieldsByName.has(col)
    );
    const blendedDataHeaders = this.buildBlendedDataHeaders(
      columnConfig,
      blendedFieldsByName,
      dataMart.storage.type
    );

    if (!hasBlendedColumns && !hasPreJoinFilters) {
      return {
        needsBlending: false,
        columnFilter: columnConfig,
        blendedDataHeaders,
      };
    }

    await this.assertAllRequestedSourcesAccessible(
      blendableSchema.blendedFields,
      blendableSchema.availableSources,
      referencedColumns,
      preJoinAliasPaths,
      accessor
    );

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
      dataMart.projectId,
      publicOrigin,
      preJoinAliasPaths
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
        columnTypes: this.buildBlendedColumnTypes(blendableSchema),
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
      chains,
    };
  }

  // Declared field types for the Athena placeholder casts, matching what the
  // validator types filters against: post-join columns are home native fields +
  // blended output aliases; pre-join slices target subsidiary raw columns by aliasPath.
  private buildBlendedColumnTypes(blendableSchema: BlendableSchemaDto): BlendedColumnTypes {
    const postJoin = new Map<string, string>();
    for (const nf of collectSchemaFieldPathTypes(blendableSchema.nativeFields)) {
      postJoin.set(nf.name, nf.type);
    }
    for (const bf of blendableSchema.blendedFields) postJoin.set(bf.name, bf.type);

    const preJoin = new Map<string, Map<string, string>>();
    for (const bf of blendableSchema.blendedFields) {
      let cols = preJoin.get(bf.aliasPath);
      if (!cols) {
        cols = new Map();
        preJoin.set(bf.aliasPath, cols);
      }
      cols.set(bf.originalFieldName, bf.type);
    }
    return { postJoin, preJoin };
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
   * Each chain's `cteName` is derived from the full `aliasPath` (dots → underscores)
   * and `parentAlias` is the parent's `cteName` ('main' at the root). The path-prefixed
   * `cteName` is what guarantees CTE uniqueness when two relationships in the join
   * tree share the same `targetAlias` (allowed under the
   * `(sourceDataMart, targetAlias)` unique constraint).
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
    projectId: string,
    publicOrigin: string,
    preJoinAliasPaths: ReadonlySet<string>
  ): Promise<ResolvedRelationshipChain[]> {
    const requestedBlendedFields = blendedFields.filter(f => referencedColumns.has(f.name));

    if (requestedBlendedFields.length === 0 && preJoinAliasPaths.size === 0) {
      return [];
    }

    // Requesting a field at aliasPath "b.c" requires resolving "b" as well so the join
    // chain is contiguous; otherwise C would try to join directly to main using B's keys.
    const neededPaths = this.collectNeededAliasPaths(requestedBlendedFields, preJoinAliasPaths);

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

    // Bucket by `aliasPath`, not `sourceRelationshipId` — one relationship can be the leaf of several paths when its parent is reachable via different aliases.
    const fieldsByAliasPath = new Map<string, BlendedFieldDto[]>();
    for (const field of requestedBlendedFields) {
      const bucket = fieldsByAliasPath.get(field.aliasPath) ?? [];
      bucket.push(field);
      fieldsByAliasPath.set(field.aliasPath, bucket);
    }

    const sortedSources = [...neededSources].sort((a, b) => a.depth - b.depth);

    const columnConfigSet = new Set(columnConfig);
    const chains: ResolvedRelationshipChain[] = [];
    for (const src of sortedSources) {
      const rel = relationshipsById.get(src.relationshipId);
      if (!rel) continue;

      const segments = src.aliasPath.split('.');
      const cteName = segments.join('_');
      const parentAlias = segments.length === 1 ? 'main' : segments.slice(0, -1).join('_');

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

      const chainBlendedFields = (fieldsByAliasPath.get(src.aliasPath) ?? []).map(f => ({
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
        cteName,
        blendedFields: chainBlendedFields,
        targetDataMartTitle: rel.targetDataMart.title,
        targetDataMartUrl,
      });
    }

    this.assertNoChainCollisions(chains);

    return chains;
  }

  // Blended column refs are flat `<aliasPath>__<field>` strings; an alias rename or
  // relationship removal orphans them, and unmatched names would otherwise be projected
  // as native main columns — producing a cryptic storage error instead of this one.
  // Hidden fields are equally unavailable: schema-hidden ones are excluded from
  // reporting by definition, and blend-hidden ones are dropped from the final SELECT
  // while their data headers are still emitted — selecting either must fail here.
  private assertNoOrphanedColumnReferences(
    dataMart: DataMart,
    columnConfig: string[],
    blendedFieldsByName: ReadonlyMap<string, BlendedFieldDto>
  ): void {
    const schemaFields = dataMart.schema?.fields ?? [];
    if (schemaFields.length === 0) return;

    const nativeNames = new Set(collectSchemaFieldPaths(schemaFields));

    const unknownColumns = columnConfig.filter(col => {
      if (nativeNames.has(col)) return false;
      const blendedField = blendedFieldsByName.get(col);
      return !blendedField || blendedField.isHidden;
    });
    if (unknownColumns.length === 0) return;

    throwDisconnectedReportColumnsError(dataMart.id, unknownColumns);
  }

  private async assertAllRequestedSourcesAccessible(
    blendedFields: BlendedFieldDto[],
    availableSources: AvailableSourceDto[],
    referencedColumns: ReadonlySet<string>,
    preJoinAliasPaths: ReadonlySet<string>,
    accessor: BlendableSchemaAccessor
  ): Promise<void> {
    const requested = blendedFields.filter(f => referencedColumns.has(f.name));
    const neededPaths = this.collectNeededAliasPaths(requested, preJoinAliasPaths);

    const sourceByPath = new Map(availableSources.map(s => [s.aliasPath, s]));
    const denied: AvailableSourceDto[] = [];
    for (const path of neededPaths) {
      const src = sourceByPath.get(path);
      if (src && !src.isAccessibleForReporting) denied.push(src);
    }
    if (denied.length === 0) return;

    const userProjection = await this.userProjectionsFetcher.fetchUserProjection(accessor.userId);
    const userLabel =
      userProjection?.fullName?.trim() || userProjection?.email?.trim() || accessor.userId;
    const titles = denied.map(s => `"${s.title}"`).join(', ');
    throw new BusinessViolationException(
      `Cannot build report SQL, user "${userLabel}" is missing access to data marts: ${titles}`,
      {
        userId: accessor.userId,
        deniedDataMartIds: denied.map(s => s.dataMartId),
        deniedAliasPaths: denied.map(s => s.aliasPath),
      }
    );
  }

  private collectNeededAliasPaths(
    requestedFields: BlendedFieldDto[],
    preJoinAliasPaths?: ReadonlySet<string>
  ): Set<string> {
    const paths = new Set<string>();
    for (const field of requestedFields) {
      const segments = field.aliasPath.split('.');
      for (let i = 1; i <= segments.length; i++) {
        paths.add(segments.slice(0, i).join('.'));
      }
    }
    for (const aliasPath of preJoinAliasPaths ?? []) {
      const segments = aliasPath.split('.');
      for (let i = 1; i <= segments.length; i++) {
        paths.add(segments.slice(0, i).join('.'));
      }
    }
    return paths;
  }

  /**
   * Defence-in-depth check that runs after `cteName`/`outputAlias` have been
   * computed:
   *  - `cteName` must be unique across chains. Path-prefixed names derived from
   *    `aliasPath` should make this impossible, but a pathological mix of
   *    `targetAlias` values (e.g. `"a_b"` at one level and `"a"` then `"b"` at
   *    two levels) could still flatten to the same identifier — catch it here
   *    instead of letting the database reject duplicate CTE names.
   *  - `outputAlias` must be unique across all chains' blended fields, otherwise
   *    the final SELECT would have two columns with the same name.
   *
   * Both classes of conflict are user-fixable, so we surface them as
   * `BusinessViolationException` with a pointer to the offending relationships.
   */
  private assertNoChainCollisions(chains: ResolvedRelationshipChain[]): void {
    const cteNameOwners = new Map<string, string[]>();
    for (const chain of chains) {
      const owners = cteNameOwners.get(chain.cteName) ?? [];
      owners.push(chain.relationship.id);
      cteNameOwners.set(chain.cteName, owners);
    }
    for (const [cteName, owners] of cteNameOwners) {
      if (owners.length > 1) {
        throw new BusinessViolationException(
          `Duplicate CTE name: cteName "${cteName}" is produced by multiple relationship chains. ` +
            `This typically means two relationship targetAlias values flatten to the same identifier ` +
            `(e.g. "a_b" at one level vs "a"+"b" at two levels). ` +
            `Rename the targetAlias on one of these relationships so each chain produces a unique CTE.`,
          { cteName, relationshipIds: owners }
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
