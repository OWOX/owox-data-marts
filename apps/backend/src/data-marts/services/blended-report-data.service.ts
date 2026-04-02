import { Injectable } from '@nestjs/common';
import { BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { BlendedQueryBuilderFacade } from '../data-storage-types/facades/blended-query-builder.facade';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { Report } from '../entities/report.entity';
import { ResolvedRelationshipChain } from '../data-storage-types/interfaces/blended-query-builder.interface';

export interface BlendingDecision {
  needsBlending: boolean;
  blendedSql?: string;
  columnFilter?: string[];
}

@Injectable()
export class BlendedReportDataService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly blendedQueryBuilderFacade: BlendedQueryBuilderFacade,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade,
    private readonly tableReferenceService: DataMartTableReferenceService
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
    const blendedFieldNames = new Set(blendableSchema.blendedFields.map(f => f.name));
    const hasBlendedColumns = columnConfig.some(col => blendedFieldNames.has(col));

    // 4. No blended columns → return base query with column filter
    if (!hasBlendedColumns) {
      return { needsBlending: false, columnFilter: columnConfig };
    }

    // 5. Full blending: resolve table refs, build relationship chains, generate SQL
    const mainTableReference = await this.tableReferenceService.resolveTableName(
      dataMart.id,
      dataMart.projectId
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
      dataMart.projectId
    );

    const blendedSql = await this.blendedQueryBuilderFacade.buildBlendedQuery(
      dataMart.storage.type,
      mainTableReference,
      chains,
      columnConfig
    );

    return { needsBlending: true, blendedSql };
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
    projectId: string
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

      chains.push({
        relationship: rel,
        targetTableReference,
        parentAlias,
      });

      // Register the target alias so transitive children can resolve their parentAlias
      dataMartAliasMap.set(rel.targetDataMart.id, rel.targetAlias);
      addedRelIds.add(relId);
    }

    return chains;
  }
}
