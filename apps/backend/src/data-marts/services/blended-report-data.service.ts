import { Injectable, Logger } from '@nestjs/common';
import { BlendableSchemaAccessor, BlendableSchemaService } from './blendable-schema.service';
import { BlendedFieldNameStyle, formatBlendedFieldDisplayName } from './blended-field-display-name';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { BlendedQueryBuilderFacade } from '../data-storage-types/facades/blended-query-builder.facade';
import { ReportLike, usesSuffixedJoinedFieldNames } from '../dto/domain/report-like-read-plan';
import { AggregationRule } from '../dto/schemas/aggregation-config.schema';
import { tryAliasPathToCteName } from '../dto/schemas/filter-config.schema';
import { SortRule } from '../dto/schemas/sort-config.schema';
import { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { withoutCountBesideSleevedCountDistinct } from '../dto/schemas/field-aggregation-governance';
import { hasMainUniqueCount, joinedUniqueCountSources } from '../dto/schemas/unique-count-sources';
import { UNIQUE_COUNT_LABEL } from '../dto/schemas/aggregation-labels';
import {
  BlendedColumnTypes,
  JoinedUniqueCountSource,
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
  collectPrimaryKeyRowIdentity,
  collectSchemaFieldPaths,
  collectSchemaFieldPathTypes,
  getMainUniqueCountKeyFields,
} from '../data-storage-types/data-mart-schema.utils';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { buildDataMartUrl } from '../../common/helpers/data-mart-url.helper';
import { UserProjectionsFetcherService } from './user-projections-fetcher.service';
import { throwDisconnectedReportColumnsError } from '../errors/disconnected-report-columns.error';
import { buildBlendedFieldIndex } from './blended-field-index';
import { buildJoinedUniqueCountColumnName } from './blended-field-name';

@Injectable()
export class BlendedReportDataService {
  private readonly logger = new Logger(BlendedReportDataService.name);

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
    accessor: BlendableSchemaAccessor,
    // Reuse an already-resolved schema (totals path) instead of recomputing it here and in the validator.
    precomputedBlendableSchema?: BlendableSchemaDto
  ): Promise<BlendingDecision> {
    const { columnConfig, dataMart } = report;
    // Travels on EVERY decision, blended or not: the reader gates the `Unique Count` header on the
    // same non-empty key the SQL gates the column on, so a key dropped since save takes both (F4).
    const primaryKeyColumns = getMainUniqueCountKeyFields(dataMart.schema?.fields ?? []).map(
      f => f.name
    );
    // A joined Unique Count references its source by alias path, not by column, so it never shows
    // up in `referencedColumns` — it has to be carried separately all the way to the chain builder.
    const uniqueCountAliasPaths = new Set(joinedUniqueCountSources(report.uniqueCountConfig));

    // Single chokepoint for both /generated-sql and the run path — catches schema drift since save.
    await this.outputControlsValidator.validateForReport({
      storageType: dataMart.storage.type,
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
      columnConfig: columnConfig ?? null,
      filterConfig: report.filterConfig ?? null,
      sortConfig: report.sortConfig ?? null,
      limitConfig: report.limitConfig ?? null,
      aggregationConfig: report.aggregationConfig ?? null,
      dateTruncConfig: report.dateTruncConfig ?? null,
      uniqueCountConfig: report.uniqueCountConfig ?? null,
      accessor,
      precomputedBlendableSchema,
    });

    const postJoinFilterColumns: string[] = [];
    const preJoinFilterColumns: string[] = [];
    for (const rule of report.filterConfig ?? []) {
      if (rule.placement === 'pre-join') {
        preJoinFilterColumns.push(rule.column);
      } else {
        postJoinFilterColumns.push(rule.column);
      }
    }
    const sortColumns = (report.sortConfig ?? []).map(s => s.column);
    const hasPreJoinFilters = preJoinFilterColumns.length > 0;
    // Totals only — a persisted `Report` never carries a restriction (see composeTotals).
    const groupRestriction = 'groupRestriction' in report ? report.groupRestriction : undefined;
    const restrictionColumns = [
      ...(groupRestriction?.dimensions ?? []),
      ...(groupRestriction?.having ?? []).map(rule => rule.column),
    ];

    if (columnConfig === null || columnConfig === undefined) {
      // Without an explicit column config the native projection is "all native
      // columns". A blended SQL build needs an explicit column list, so any
      // blended reference (post-join filter / sort / pre-join slice / joined
      // Unique Count) while columnConfig is null is malformed — reject early
      // instead of falling through to a native query that can't resolve it.
      if (
        postJoinFilterColumns.length === 0 &&
        sortColumns.length === 0 &&
        !hasPreJoinFilters &&
        uniqueCountAliasPaths.size === 0
      ) {
        return { needsBlending: false, primaryKeyColumns };
      }

      const blendableSchema =
        precomputedBlendableSchema ??
        (await this.blendableSchemaService.computeBlendableSchema(
          dataMart.id,
          dataMart.projectId,
          accessor
        ));
      const blendedFieldsByName = new Map(blendableSchema.blendedFields.map(f => [f.name, f]));
      const blendedRefs = [...postJoinFilterColumns, ...sortColumns].filter(c =>
        blendedFieldsByName.has(c)
      );
      if (blendedRefs.length === 0 && !hasPreJoinFilters && uniqueCountAliasPaths.size === 0) {
        return { needsBlending: false, primaryKeyColumns };
      }

      throw new BusinessViolationException(
        'Cannot build report SQL: blended output controls require an explicit column selection',
        {
          blendedFilterOrSortColumns: blendedRefs,
          preJoinColumns: preJoinFilterColumns,
          uniqueCountSources: [...uniqueCountAliasPaths],
        }
      );
    }

    const blendableSchema =
      precomputedBlendableSchema ??
      (await this.blendableSchemaService.computeBlendableSchema(
        dataMart.id,
        dataMart.projectId,
        accessor
      ));

    const fieldIndex = buildBlendedFieldIndex(blendableSchema);
    const preJoinAliasPaths = new Set<string>(
      preJoinFilterColumns
        .map(column => fieldIndex.get(column)?.aliasPath)
        .filter((p): p is string => p != null)
    );

    const blendedFieldsByName = new Map(blendableSchema.blendedFields.map(f => [f.name, f]));
    this.assertNoOrphanedColumnReferences(dataMart, columnConfig, blendedFieldsByName);

    const referencedColumns = new Set<string>([
      ...columnConfig,
      ...postJoinFilterColumns,
      ...sortColumns,
      // A Totals plan projects only metrics and carries no HAVING in `filterConfig` — its
      // dimensions and metric filters live in `groupRestriction` instead. They are
      // nonetheless referenced by the emitted SQL, so they must count as referenced here too:
      // otherwise a JOINED restriction dimension never reaches `buildRelationshipChains`, its
      // qualifier falls back to `main."<alias>"` (unrecognized name), its source is never
      // access-checked, and a report whose ONLY blended reference was that dimension is routed
      // to the flat builder altogether.
      ...restrictionColumns,
    ]);
    const hasBlendedColumns = Array.from(referencedColumns).some(col =>
      blendedFieldsByName.has(col)
    );
    const blendedDataHeaders = this.buildBlendedDataHeaders(
      columnConfig,
      blendedFieldsByName,
      dataMart.storage.type,
      usesSuffixedJoinedFieldNames(report) ? 'suffix' : 'prefix'
    );

    if (!hasBlendedColumns && !hasPreJoinFilters && uniqueCountAliasPaths.size === 0) {
      return {
        needsBlending: false,
        columnFilter: columnConfig,
        blendedDataHeaders,
        primaryKeyColumns,
      };
    }

    await this.assertAllRequestedSourcesAccessible(
      blendableSchema.blendedFields,
      blendableSchema.availableSources,
      referencedColumns,
      preJoinAliasPaths,
      uniqueCountAliasPaths,
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
      preJoinAliasPaths,
      uniqueCountAliasPaths
    );

    const uniqueCountSources = this.resolveUniqueCountSources(
      uniqueCountAliasPaths,
      chains,
      blendableSchema.availableSources,
      usesSuffixedJoinedFieldNames(report) ? 'suffix' : 'prefix'
    );

    const liveChains = this.withoutChainsOnlyADroppedUniqueCountNeeded(
      chains,
      uniqueCountSources,
      blendableSchema.blendedFields,
      referencedColumns,
      preJoinAliasPaths
    );

    // `uniqueCountSources` is resolved from the CURRENT schema while `uniqueCountConfig` comes from
    // the STORED report, so a source that lost its key or its reporting inclusion is dropped just
    // above. A stored sort on its metric would still render `ORDER BY "<source>__unique_count"`
    // against a SELECT that no longer has it — a warehouse error on every scheduled run, which
    // never opens the editor that prunes the rule. Drop those rules alongside the metric, the same
    // way the main path does (see ReportSqlComposerService.compose).
    const stalePaths = [...uniqueCountAliasPaths].filter(
      path => !uniqueCountSources.some(source => source.aliasPath === path)
    );
    const sortConfig =
      stalePaths.length > 0
        ? this.withoutStaleUniqueCountSorts(
            report.sortConfig ?? [],
            stalePaths,
            dataMart,
            blendedFieldsByName
          )
        : report.sortConfig;
    // A column silently leaving a nightly export shifts every formula to its right, and nothing
    // else in this path says a word about it.
    if (stalePaths.length > 0) {
      this.logger.warn(
        `Data Mart ${dataMart.id}: dropped the Unique Count column of ${stalePaths.join(', ')} — ` +
          'the source is gone, excluded from reporting, or has no usable primary key' +
          (sortConfig?.length === report.sortConfig?.length ? '' : ', and its sort rule with it')
      );
    }

    const normalizedAggregations = this.withoutJoinedCountBesideCountDistinct(
      report.aggregationConfig ?? [],
      new Set(blendableSchema.blendedFields.map(f => f.name))
    );
    if (normalizedAggregations) {
      this.logger.warn(
        `Data Mart ${dataMart.id}: dropped a joined COUNT that would duplicate its COUNT_DISTINCT ` +
          `column (${report.aggregationConfig?.length ?? 0} → ${normalizedAggregations.length} aggregations)`
      );
    }
    const blendedResult = await this.blendedQueryBuilderFacade.buildBlendedQuery(
      dataMart.storage.type,
      {
        mainTableReference,
        mainDataMartTitle: dataMart.title,
        mainDataMartUrl,
        chains: liveChains,
        columns: columnConfig,
        filters: report.filterConfig ?? undefined,
        sort: sortConfig ?? undefined,
        limit: report.limitConfig ?? undefined,
        aggregations: normalizedAggregations ?? report.aggregationConfig ?? undefined,
        dateTruncs: report.dateTruncConfig ?? undefined,
        uniqueCount: hasMainUniqueCount(report.uniqueCountConfig),
        primaryKeyColumns,
        uniqueCountSources,
        columnTypes: this.buildBlendedColumnTypes(blendableSchema),
        fieldIndex,
        groupRestriction,
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
      chains: liveChains,
      aggregations: normalizedAggregations,
      primaryKeyColumns,
      // The SAME array the builder rendered sleeves from — the reader's headers must not be a
      // second, independently-derived list, or a source dropped here still gets a header.
      uniqueCountSources,
    };
  }

  /**
   * Resolves each configured joined source to the chain and key its `COUNT(DISTINCT …)` needs.
   *
   * A source is dropped when its chain could not be built, its alias path no longer exists, it is
   * excluded from reporting, or its primary key is gone — the sleeve has nothing it may count in
   * any of those cases. Whatever survives is what BOTH the SQL and the result headers are built
   * from, so every one of those predicates has to live here rather than downstream.
   */
  private resolveUniqueCountSources(
    uniqueCountAliasPaths: ReadonlySet<string>,
    chains: ResolvedRelationshipChain[],
    availableSources: AvailableSourceDto[],
    nameStyle: BlendedFieldNameStyle
  ): JoinedUniqueCountSource[] {
    const chainByCteName = new Map(chains.map(c => [c.cteName, c]));
    const sourceByAliasPath = new Map(availableSources.map(s => [s.aliasPath, s]));

    return [...uniqueCountAliasPaths]
      .map(aliasPath => {
        const cteName = tryAliasPathToCteName(aliasPath);
        const chain = cteName === undefined ? undefined : chainByCteName.get(cteName);
        const source = sourceByAliasPath.get(aliasPath);
        const pkColumns = chain?.targetPrimaryKeyFields ?? [];
        if (!chain || !source || source.isIncluded === false || pkColumns.length === 0) {
          return undefined;
        }
        return {
          aliasPath,
          cteName: chain.cteName,
          pkColumns,
          // The SQL identifier comes from the alias path; the free-form display prefix stays out
          // of SQL and rides along as the header's display alias.
          outputLabel: buildJoinedUniqueCountColumnName(aliasPath),
          // The metric is a joined field like any other, so its header follows the same
          // per-destination convention every other joined column's does.
          displayLabel: formatBlendedFieldDisplayName(
            {
              name: UNIQUE_COUNT_LABEL,
              // A blank Output Alias would render the bare `Unique Count` — the main Data Mart's
              // own header. Same fallback the picker's row uses.
              outputPrefix: source.defaultAlias.trim() || source.title,
            },
            nameStyle
          ),
        };
      })
      .filter((s): s is JoinedUniqueCountSource => s !== undefined);
  }

  /**
   * Drops the chains that exist ONLY to serve a joined Unique Count `resolveUniqueCountSources`
   * then dropped. `uniqueCountConfig` seeds the chain set by alias path, so such a source still had
   * its CTE built and LEFT JOINed — a paid warehouse scan feeding a column nobody reads.
   *
   * Deliberately narrow, and it must stay that way. `buildRelationshipChains` is NOT filtered by
   * `isIncluded`, and that is load-bearing: an excluded source's fields remain selectable,
   * filterable and sortable, and an ordinary `ORDER BY orders__amount` on one resolves precisely
   * BECAUSE the join is built unconditionally. So this recomputes what the chain set would have
   * been had `uniqueCountConfig` never seeded it, then adds back the SURVIVING sources (and their
   * ancestors, which a nested one still needs). A chain goes only when nothing else wanted it.
   */
  private withoutChainsOnlyADroppedUniqueCountNeeded(
    chains: ResolvedRelationshipChain[],
    uniqueCountSources: JoinedUniqueCountSource[],
    blendedFields: BlendedFieldDto[],
    referencedColumns: ReadonlySet<string>,
    preJoinAliasPaths: ReadonlySet<string>
  ): ResolvedRelationshipChain[] {
    // Mirrors buildRelationshipChains' own `requestedBlendedFields` — the two must not drift.
    const stillNeeded = this.collectNeededAliasPaths(
      blendedFields.filter(f => referencedColumns.has(f.name)),
      new Set([...preJoinAliasPaths, ...uniqueCountSources.map(s => s.aliasPath)])
    );
    const keptCteNames = new Set(
      [...stillNeeded]
        .map(tryAliasPathToCteName)
        .filter((name): name is string => name !== undefined)
    );
    const kept = chains.filter(chain => keptCteNames.has(chain.cteName));
    return kept.length === chains.length ? chains : kept;
  }

  /**
   * Drops the sort rules that point at a joined Unique Count the SELECT no longer emits.
   *
   * A real field may legitimately own the metric's `<aliasPath>__unique_count` name — then the rule
   * sorts by that field and must survive the source being dropped. A HIDDEN blended field does not
   * count as an owner: it is not projected, the picker's own repair excludes it, and disagreeing
   * here means a scheduled run keeps sorting by it while opening the editor deletes the rule.
   */
  private withoutStaleUniqueCountSorts(
    sortConfig: SortRule[],
    stalePaths: string[],
    dataMart: DataMart,
    blendedFieldsByName: ReadonlyMap<string, BlendedFieldDto>
  ): SortRule[] {
    const nativeNames = new Set(collectSchemaFieldPaths(dataMart.schema?.fields ?? []));
    const staleColumns = new Set(
      stalePaths.map(buildJoinedUniqueCountColumnName).filter(name => {
        if (nativeNames.has(name)) return false;
        const owner = blendedFieldsByName.get(name);
        return owner === undefined || owner.isHidden === true;
      })
    );
    if (staleColumns.size === 0) return sortConfig;
    return sortConfig.filter(rule => !staleColumns.has(rule.column));
  }

  /**
   * A saved COUNT beside a joined COUNT_DISTINCT is dropped rather than rejected: the two are
   * computed at different grains and can invert, but the report was valid when it was saved.
   * Returns undefined when nothing changed, so callers keep their own list.
   */
  private withoutJoinedCountBesideCountDistinct(
    aggregations: AggregationRule[],
    joinedColumns: ReadonlySet<string>
  ): AggregationRule[] | undefined {
    const functionsByJoinedColumn = new Map<string, ReportAggregateFunction[]>();
    for (const rule of aggregations) {
      if (!joinedColumns.has(rule.column)) continue;
      functionsByJoinedColumn.set(rule.column, [
        ...(functionsByJoinedColumn.get(rule.column) ?? []),
        rule.function,
      ]);
    }

    const dropped = new Set<string>();
    for (const [column, functions] of functionsByJoinedColumn) {
      const kept = new Set(withoutCountBesideSleevedCountDistinct(functions));
      for (const fn of functions) {
        if (!kept.has(fn)) dropped.add(`${column}\u0000${fn}`);
      }
    }
    if (dropped.size === 0) return undefined;
    return aggregations.filter(rule => !dropped.has(`${rule.column}\u0000${rule.function}`));
  }

  private buildBlendedColumnTypes(blendableSchema: BlendableSchemaDto): BlendedColumnTypes {
    const postJoin = new Map<string, string>();
    for (const nf of collectSchemaFieldPathTypes(blendableSchema.nativeFields)) {
      postJoin.set(nf.name, nf.type);
    }
    for (const bf of blendableSchema.blendedFields) postJoin.set(bf.name, bf.type);
    return { postJoin };
  }

  /**
   * `nameStyle` is the destination's joined-field naming convention. The resulting alias IS the
   * string the destination renders — the Google Sheets writer both writes it into row 1 and
   * persists it into `OWOX_COLUMNS`, so the two must come from here rather than being recomposed
   * downstream.
   */
  private buildBlendedDataHeaders(
    columnConfig: string[],
    blendedFieldsByName: Map<string, BlendedFieldDto>,
    storageType: DataStorageType,
    nameStyle: BlendedFieldNameStyle
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
            formatBlendedFieldDisplayName(blendedField, nameStyle),
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
    preJoinAliasPaths: ReadonlySet<string>,
    uniqueCountAliasPaths: ReadonlySet<string>
  ): Promise<ResolvedRelationshipChain[]> {
    const requestedBlendedFields = blendedFields.filter(f => referencedColumns.has(f.name));

    if (
      requestedBlendedFields.length === 0 &&
      preJoinAliasPaths.size === 0 &&
      uniqueCountAliasPaths.size === 0
    ) {
      return [];
    }

    // Requesting a field at aliasPath "b.c" requires resolving "b" as well so the join
    // chain is contiguous; otherwise C would try to join directly to main using B's keys.
    const neededPaths = this.collectNeededAliasPaths(
      requestedBlendedFields,
      new Set([...preJoinAliasPaths, ...uniqueCountAliasPaths])
    );

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
        targetFieldType: f.sourceFieldType ?? f.type,
      }));

      chains.push({
        relationship: rel,
        targetTableReference,
        parentAlias,
        cteName,
        blendedFields: chainBlendedFields,
        targetDataMartTitle: rel.targetDataMart.title,
        targetDataMartUrl,
        targetPrimaryKeyFields: collectPrimaryKeyRowIdentity(
          rel.targetDataMart.schema?.fields ?? []
        ),
      });
    }

    this.assertNoChainCollisions(chains);

    return chains;
  }

  // Blended column refs are unified names from `buildBlendedFieldUnifiedName`
  // (flat: `<aliasPath>__<field>`; nested: same with a stable hash suffix). An alias
  // rename or relationship removal orphans them, and unmatched names would otherwise
  // be projected as native main columns — producing a cryptic storage error instead of this one.
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
    uniqueCountAliasPaths: ReadonlySet<string>,
    accessor: BlendableSchemaAccessor
  ): Promise<void> {
    const requested = blendedFields.filter(f => referencedColumns.has(f.name));
    // Counting a source's distinct keys reads that source, so it is access-checked like any
    // selected column — a Unique Count must not be a way around the reporting grant.
    const neededPaths = this.collectNeededAliasPaths(
      requested,
      new Set([...preJoinAliasPaths, ...uniqueCountAliasPaths])
    );

    const sourceByPath = new Map(availableSources.map(s => [s.aliasPath, s]));

    // Defence-in-depth: the save-time validator rejects slices on excluded
    // sources (FILTER_ALIAS_PATH_NOT_INCLUDED), but the run path resolves slices
    // through a fieldIndex that still includes excluded fields (isIncluded:false).
    // Refuse to build a slice against an excluded source here too.
    const excluded: AvailableSourceDto[] = [];
    for (const path of preJoinAliasPaths) {
      const src = sourceByPath.get(path);
      if (src && src.isIncluded === false) excluded.push(src);
    }
    if (excluded.length > 0) {
      const titles = excluded.map(s => `"${s.title}"`).join(', ');
      throw new BusinessViolationException(
        `Cannot build report SQL: a pre-join filter targets data marts excluded from reporting: ${titles}`,
        {
          excludedDataMartIds: excluded.map(s => s.dataMartId),
          excludedAliasPaths: excluded.map(s => s.aliasPath),
        }
      );
    }

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
