import { Injectable } from '@nestjs/common';
import { BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { BlendedQueryBuilderFacade } from '../data-storage-types/facades/blended-query-builder.facade';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { Report } from '../entities/report.entity';
import { ResolvedRelationshipChain } from '../data-storage-types/interfaces/blended-query-builder.interface';
import { ReportDataHeader } from '../dto/domain/report-data-header.dto';
import { BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { buildDataMartUrl } from '../../common/helpers/data-mart-url.helper';

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
      allRelationships,
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
            blendedField.alias || blendedField.name,
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
   */
  private async buildRelationshipChains(
    columnConfig: string[],
    blendedFields: import('../dto/domain/blendable-schema.dto').BlendedFieldDto[],
    directRelationships: import('../entities/data-mart-relationship.entity').DataMartRelationship[],
    projectId: string,
    publicOrigin: string
  ): Promise<ResolvedRelationshipChain[]> {
    const requestedNames = new Set(columnConfig);

    // Identify which blended fields are actually requested
    const requestedBlendedFields = blendedFields.filter(f => requestedNames.has(f.name));

    // Collect unique relationship IDs needed, preserving order by transitiveDepth
    const neededRelationshipIds = new Set(requestedBlendedFields.map(f => f.sourceRelationshipId));

    if (neededRelationshipIds.size === 0) {
      return [];
    }

    // Build a map from relationship id → loaded relationship entity
    // Direct relationships are already available
    const directRelMap = new Map(directRelationships.map(r => [r.id, r]));

    // For transitive relationships, we may need to load them.
    // We'll collect all needed IDs and load missing ones via findById.
    const allNeededIds = Array.from(neededRelationshipIds);
    const relationshipsById = new Map(directRelMap);

    for (const relId of allNeededIds) {
      if (!relationshipsById.has(relId)) {
        const rel = await this.relationshipService.findById(relId);
        if (rel) {
          relationshipsById.set(relId, rel);
        }
      }
    }

    // Build alias→targetAlias chain for parentAlias resolution.
    // For each needed relationship, determine parentAlias:
    // - if transitiveDepth === 1 → parentAlias = 'main'
    // - if transitiveDepth > 1 → parentAlias = the targetAlias of the relationship that
    //   points to this relationship's source data mart
    //
    // We use the blendedFields metadata to determine depth and build the chain.
    const chains: ResolvedRelationshipChain[] = [];
    const addedRelIds = new Set<string>();

    // Sort by transitiveDepth ascending so we process parents before children
    const sortedFields = [...requestedBlendedFields].sort(
      (a, b) => a.transitiveDepth - b.transitiveDepth
    );

    // Map: dataMartId → alias (how this data mart is referenced)
    // 'main' for the root data mart
    const dataMartAliasMap = new Map<string, string>();

    // We need root dataMartId. It's the sourceDataMart of the direct relationships.
    // We can infer it from directRelationships[0].sourceDataMart.id if available
    if (directRelationships.length > 0) {
      const rootId = directRelationships[0].sourceDataMart.id;
      dataMartAliasMap.set(rootId, 'main');
    }

    for (const field of sortedFields) {
      const relId = field.sourceRelationshipId;
      if (addedRelIds.has(relId)) {
        continue;
      }

      const rel = relationshipsById.get(relId);
      if (!rel) {
        continue;
      }

      // Determine parentAlias
      const parentAlias =
        field.transitiveDepth === 1
          ? 'main'
          : (dataMartAliasMap.get(rel.sourceDataMart.id) ?? 'main');

      // Resolve target table reference
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

      const chainBlendedFields = requestedBlendedFields
        .filter(f => f.sourceRelationshipId === relId)
        .map(f => ({
          targetFieldName: f.originalFieldName,
          outputAlias: f.name,
          isHidden: f.isHidden,
          aggregateFunction:
            f.aggregateFunction as import('../dto/schemas/relationship-schemas').BlendedFieldConfig['aggregateFunction'],
        }));

      chains.push({
        relationship: rel,
        targetTableReference,
        parentAlias,
        blendedFields: chainBlendedFields,
        targetDataMartTitle: rel.targetDataMart.title,
        targetDataMartUrl,
      });

      // Register the target alias so transitive children can resolve their parentAlias
      dataMartAliasMap.set(rel.targetDataMart.id, rel.targetAlias);
      addedRelIds.add(relId);
    }

    return chains;
  }
}
