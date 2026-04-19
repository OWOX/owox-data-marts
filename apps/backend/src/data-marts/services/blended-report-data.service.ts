import { Injectable } from '@nestjs/common';
import { BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { BlendedQueryBuilderFacade } from '../data-storage-types/facades/blended-query-builder.facade';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { Report } from '../entities/report.entity';
import { ResolvedRelationshipChain } from '../data-storage-types/interfaces/blended-query-builder.interface';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { AvailableSourceDto, BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { buildDataMartUrl } from '../../common/helpers/data-mart-url.helper';
import { ReportRunLogger } from '../report-run-logging/report-run-logger';

export interface BlendingDecision {
  needsBlending: boolean;
  blendedSql?: string;
  columnFilter?: string[];
  /**
   * Precomputed headers for columns in `columnFilter` that come from
   * blended schema (not native). Readers combine these with their own
   * native headers to construct the final ordered header list.
   *
   * Only populated when `columnFilter` is set. Contains at most one entry
   * per blended column in `columnFilter`.
   */
  blendedDataHeaders?: ReportDataHeader[];
}

@Injectable()
export class BlendedReportDataService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly blendedQueryBuilderFacade: BlendedQueryBuilderFacade,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade,
    private readonly tableReferenceService: DataMartTableReferenceService,
    private readonly publicOriginService: PublicOriginService
  ) {}

  async resolveBlendingDecision(report: Report): Promise<BlendingDecision> {
    const { columnConfig, dataMart } = report;

    // 1. If columnConfig is null → no blending
    if (columnConfig === null || columnConfig === undefined) {
      return { needsBlending: false };
    }

    // 2. Compute blendable schema for the data mart
    const blendableSchema = await this.blendableSchemaService.computeBlendableSchema(
      dataMart.id,
      dataMart.projectId
    );

    // 3. Check if any column in columnConfig matches a blended field name
    const blendedFieldsByName = new Map(blendableSchema.blendedFields.map(f => [f.name, f]));
    const hasBlendedColumns = columnConfig.some(col => blendedFieldsByName.has(col));

    // Precompute headers for blended columns so readers do not need to know
    // anything about blended schema metadata (alias/description/type).
    const blendedDataHeaders = this.buildBlendedDataHeaders(columnConfig, blendedFieldsByName);

    // 4. No blended columns → return base query with column filter
    if (!hasBlendedColumns) {
      return {
        needsBlending: false,
        columnFilter: columnConfig,
        blendedDataHeaders,
      };
    }

    // 5. Full blending: resolve table refs, build relationship chains, generate SQL
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

    // Load direct relationships for the main data mart
    const allRelationships = await this.relationshipService.findBySourceDataMartId(dataMart.id);

    // Build alias→tableReference map for transitive lookups
    // We need to resolve chains: for each relationship whose blended fields appear in columnConfig,
    // resolve target table reference and determine parentAlias
    const chains = await this.buildRelationshipChains(
      columnConfig,
      blendableSchema.blendedFields,
      blendableSchema.availableSources,
      allRelationships,
      dataMart.id,
      dataMart.projectId,
      publicOrigin
    );

    const blendedSql = await this.blendedQueryBuilderFacade.buildBlendedQuery(
      dataMart.storage.type,
      {
        mainTableReference,
        mainDataMartTitle: dataMart.title,
        mainDataMartUrl,
        chains,
        columns: columnConfig,
      }
    );

    return {
      needsBlending: true,
      blendedSql,
      columnFilter: columnConfig,
      blendedDataHeaders,
    };
  }

  /**
   * Emits a structured log entry with the blended SQL produced by
   * `resolveBlendingDecision` so that users can inspect the query that was
   * used for their run in the history UI. No-op when blending was not
   * required, the SQL is missing, or a logger was not provided.
   */
  logBlendedSqlIfNeeded(decision: BlendingDecision, logger?: ReportRunLogger): void {
    if (!logger || !decision.needsBlending || !decision.blendedSql) {
      return;
    }
    logger.log({
      type: 'blended-sql',
      message: 'Blended SQL used for report execution',
      sql: decision.blendedSql,
    });
  }

  /**
   * Builds ReportDataHeader entries for columns in `columnConfig` that come
   * from blended schema. Columns not found in the blended schema are skipped
   * (they are native and will be supplied by the reader's headers generator).
   */
  private buildBlendedDataHeaders(
    columnConfig: string[],
    blendedFieldsByName: Map<string, BlendedFieldDto>
  ): ReportDataHeader[] {
    const headers: ReportDataHeader[] = [];
    for (const col of columnConfig) {
      const blendedField = blendedFieldsByName.get(col);
      if (blendedField) {
        headers.push(
          new ReportDataHeader(
            blendedField.name,
            `${blendedField.outputPrefix} ${blendedField.alias || blendedField.originalFieldName}`,
            blendedField.description || undefined,
            // Blended field types come from the target data mart schema.
            // They are not typed as the concrete storage-type enum here,
            // so we leave storageFieldType undefined — destinations only
            // use it for formatting hints.
            undefined
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
    blendedFields: BlendedFieldDto[],
    availableSources: AvailableSourceDto[],
    directRelationships: DataMartRelationship[],
    rootDataMartId: string,
    projectId: string,
    publicOrigin: string
  ): Promise<ResolvedRelationshipChain[]> {
    const requestedNames = new Set(columnConfig);
    const requestedBlendedFields = blendedFields.filter(f => requestedNames.has(f.name));

    if (requestedBlendedFields.length === 0) {
      return [];
    }

    // Step 1: expand requested aliasPaths to include all ancestor paths.
    // E.g. requesting a field with aliasPath "b.c" requires both "b" and "b.c".
    const neededPaths = new Set<string>();
    for (const field of requestedBlendedFields) {
      const segments = field.aliasPath.split('.');
      for (let i = 1; i <= segments.length; i++) {
        neededPaths.add(segments.slice(0, i).join('.'));
      }
    }

    // Step 2: for each needed path, look up the corresponding source metadata
    // (relationshipId + dataMartId + depth).
    const sourceByPath = new Map(availableSources.map(s => [s.aliasPath, s]));
    const neededSources: AvailableSourceDto[] = [];
    for (const path of neededPaths) {
      const src = sourceByPath.get(path);
      if (src) neededSources.push(src);
    }

    // Step 3: load relationship entities for every needed source.
    const directRelMap = new Map(directRelationships.map(r => [r.id, r]));
    const relationshipsById = new Map(directRelMap);
    for (const src of neededSources) {
      if (!relationshipsById.has(src.relationshipId)) {
        const rel = await this.relationshipService.findById(src.relationshipId);
        if (rel) relationshipsById.set(src.relationshipId, rel);
      }
    }

    // Step 4: group requested blended fields by relationship id so each chain
    // only includes the fields that actually need to be aggregated for it.
    const fieldsByRelId = new Map<string, BlendedFieldDto[]>();
    for (const field of requestedBlendedFields) {
      const bucket = fieldsByRelId.get(field.sourceRelationshipId) ?? [];
      bucket.push(field);
      fieldsByRelId.set(field.sourceRelationshipId, bucket);
    }

    // Step 5: sort sources by depth so parents are processed before children.
    // This guarantees dataMartAliasMap has the parent's alias registered by the
    // time we compute parentAlias for a child.
    const sortedSources = [...neededSources].sort((a, b) => a.depth - b.depth);

    const dataMartAliasMap = new Map<string, string>();
    dataMartAliasMap.set(rootDataMartId, 'main');

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
        isHidden: f.isHidden,
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
