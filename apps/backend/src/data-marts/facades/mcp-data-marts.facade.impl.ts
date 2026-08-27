import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AI_INSIGHTS_SCHEMA_EXPIRES_AFTER_MS } from '../ai-insights/ai-insights.constants';
import { prepareSchema } from '../ai-insights/utils/prepare-schema';
import type {
  DataMartSchema,
  DataMartSchemaField,
} from '../data-storage-types/data-mart-schema.type';
import { isConnected } from '../data-storage-types/data-mart-schema.utils';
import { GetDataMartCommand } from '../dto/domain/get-data-mart.command';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { SummarizeMcpDataCatalogCommand } from '../dto/domain/summarize-mcp-data-catalog.command';
import { BlendableSchemaService } from '../services/blendable-schema.service';
import { formatBlendedFieldDisplayName } from '../services/blended-field-display-name';
import { buildJoinedUniqueCountColumnName } from '../services/blended-field-name';
import { UNIQUE_COUNT_LABEL } from '../dto/schemas/aggregation-labels';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { GetDataMartService } from '../use-cases/get-data-mart.service';
import { ListDataMartsService } from '../use-cases/list-data-marts.service';
import { QueryDataMartCommand, QueryDataMartService } from '../use-cases/query-data-mart.service';
import { SummarizeMcpDataCatalogService } from '../use-cases/summarize-mcp-data-catalog.service';
import {
  McpDataCatalogSummaryResponse,
  McpDataMartsFacade,
  McpDataMartDetailsResponse,
  McpGetDataMartDetailsRequest,
  McpJoinDto,
  McpJoinedFieldDto,
  McpListDataMartsRequest,
  McpListDataMartsResponse,
  McpQueryDataMartRequest,
  McpQueryDataMartResponse,
  McpSummarizeDataCatalogRequest,
  McpUniqueCountSourceDto,
} from './mcp-data-marts.facade';

@Injectable()
export class McpDataMartsFacadeImpl implements McpDataMartsFacade {
  private readonly logger = new Logger(McpDataMartsFacadeImpl.name);

  constructor(
    private readonly listDataMartsService: ListDataMartsService,
    private readonly getDataMartService: GetDataMartService,
    private readonly dataMartService: DataMartService,
    private readonly queryDataMartService: QueryDataMartService,
    private readonly blendableSchemaService: BlendableSchemaService,
    private readonly relationshipService: DataMartRelationshipService,
    private readonly summarizeMcpDataCatalogService: SummarizeMcpDataCatalogService
  ) {}

  async listDataMarts(request: McpListDataMartsRequest): Promise<McpListDataMartsResponse> {
    const status = request.status === 'draft' ? DataMartStatus.DRAFT : DataMartStatus.PUBLISHED;
    const result = await this.listDataMartsService.run(
      new ListDataMartsCommand(
        request.projectId,
        request.userId,
        request.roles,
        undefined,
        undefined,
        status
      )
    );

    return {
      dataMarts: result.items
        // Keep this gate at the facade boundary: the underlying list use case is allowed to
        // return a mixed result, but MCP must return only the explicitly requested state.
        .filter(item => item.status === status)
        .map(item => ({
          id: item.id,
          title: item.title,
          description: item.description,
          status: item.status,
          updatedAt: item.modifiedAt.toISOString(),
        })),
    };
  }

  async getDataMartDetails(
    request: McpGetDataMartDetailsRequest
  ): Promise<McpDataMartDetailsResponse> {
    await this.ensurePublishedDataMartAccessible(request);

    const dataMart = await this.dataMartService.actualizeSchemaIfExpired(
      request.dataMartId,
      request.projectId,
      AI_INSIGHTS_SCHEMA_EXPIRES_AFTER_MS
    );
    const schema = dataMart.schema
      ? (prepareSchema({
          ...dataMart.schema,
          fields: this.filterAvailableFields(dataMart.schema.fields),
        } as DataMartSchema) as { fields: Array<Record<string, unknown>> })
      : undefined;

    const { joinedFields, joins, uniqueCountSources } = request.includeJoinedFields
      ? await this.resolveJoinedFields(request, this.topLevelFieldNames(schema?.fields ?? []))
      : { joinedFields: [], joins: [], uniqueCountSources: [] };

    return {
      id: dataMart.id,
      name: dataMart.title,
      description: dataMart.description ?? '',
      fields: this.withDisplayNames(schema?.fields ?? []),
      joinedFields,
      joins,
      uniqueCountSources,
    };
  }

  /**
   * Fields contributed by joined/blended data marts, with their qualified `<alias>__<field>`
   * names — best-effort, so a discovery call still returns native fields if the blend can't be
   * resolved (e.g. a deleted join target). Also surfaces each accessible source's Unique Count
   * pseudo-field (#6792): appended to `joinedFields` for the model to see, and repeated in
   * `uniqueCountSources` (never sent to the client) so query_data_mart can translate a selected
   * pseudo-field name back into its source's aliasPath — but never under a name a REAL field
   * already owns (`nativeFieldNames` carries the home mart's, checked together with the blended
   * ones), which would shadow that field and make it unreachable through this tool.
   */
  private async resolveJoinedFields(
    request: McpGetDataMartDetailsRequest,
    nativeFieldNames: ReadonlySet<string>
  ): Promise<{
    joinedFields: McpJoinedFieldDto[];
    joins: McpJoinDto[];
    uniqueCountSources: McpUniqueCountSourceDto[];
  }> {
    try {
      // No outgoing relationships → no blended fields; skip the heavier blendable-schema
      // computation on the (common) non-blended discovery path.
      const relationships = await this.relationshipService.findBySourceDataMartId(
        request.dataMartId
      );
      if (relationships.length === 0) {
        return { joinedFields: [], joins: [], uniqueCountSources: [] };
      }

      const blendable = await this.blendableSchemaService.computeBlendableSchema(
        request.dataMartId,
        request.projectId,
        { userId: request.userId, roles: request.roles }
      );

      // Expose only fields from included sources the caller may report on — mirror the report
      // UI's gate (isIncluded + isAccessibleForReporting). computeBlendableSchema resolves access
      // per source but leaves it on availableSources; without this filter we would leak the
      // schema of joined data marts the caller has no reporting access to.
      const accessibleSources = blendable.availableSources.filter(
        s => s.isIncluded && s.isAccessibleForReporting
      );
      const accessiblePaths = new Set(accessibleSources.map(s => s.aliasPath));

      const joins = await this.resolveJoins(accessibleSources);

      const visibleBlendedFields = blendable.blendedFields.filter(
        f => !f.isHidden && accessiblePaths.has(f.aliasPath)
      );

      // A joined Data Mart's CALCULATED field is OMITTED rather than published as unusable.
      // The own-mart path publishes an aggregate-level formula and clamps its
      // allowedAggregations to [] because that field is still selectable by name — only
      // aggregating it is refused. This one is refused on every surface a query can name it on
      // (projection, filter, sort, aggregation, date bucket), so a clamp would leave a name whose
      // every use is a paid round trip to a 400; the own-mart path drops such a field instead
      // (`filterAvailableFields`). The REST `BlendedFieldDto` still carries it under
      // `isCalculated` for the report picker, which must explain an ALREADY-SAVED selection — MCP
      // holds no saved selection to explain, and its contract tells the agent to copy every
      // published name verbatim into query_data_mart.
      const blendedFields = visibleBlendedFields
        .filter(f => !f.isCalculated)
        .map(f => ({
          name: f.name,
          displayName: formatBlendedFieldDisplayName(f),
          type: f.type,
          description: f.description ?? '',
          sourceDataMart: f.sourceDataMartTitle,
          // Expose the raw type only when the dedup changed it — slices run pre-join on the raw value.
          ...(f.sourceFieldType && f.sourceFieldType !== f.type
            ? { sliceType: f.sourceFieldType }
            : {}),
          // Forward an EMPTY override too: [] means "no aggregations allowed" (the
          // validator enforces it via `postJoinAggregations ?? …`, where [] is not
          // nullish). Dropping it would make consumers fall back to type defaults
          // and advertise aggregations every query would then reject.
          ...(f.postJoinAggregations ? { allowedAggregations: f.postJoinAggregations } : {}),
        }));

      // Only 'available' sources get a pseudo-field: a source missing a usable primary key has
      // nothing to COUNT DISTINCT, and the model cannot act on a hint to go set one — omitting it
      // entirely is safer than advertising a field that would just fail at the warehouse.
      const uniqueCountSources: McpUniqueCountSourceDto[] = [];
      const uniqueCountFields: McpJoinedFieldDto[] = [];
      // `orders__unique_count` is byte-identical to the unified name of a real flat field called
      // `unique_count` on the `orders` source (and to a native column of that literal name).
      // Read off the pre-omission list: a joined calculated field of that name is not published,
      // but the blendable schema still holds it, so a query naming it is refused there — the
      // pseudo-field must not claim a name the validator would answer with a 400.
      const realFieldNames = new Set([
        ...nativeFieldNames,
        ...visibleBlendedFields.map(f => f.name),
      ]);
      const eligibleSources = accessibleSources.filter(
        s =>
          s.uniqueCountAvailability === 'available' &&
          // The real field wins: shadowing it would answer a request for that column with
          // COUNT(DISTINCT pk), and selecting both would collide on one output alias anyway.
          !realFieldNames.has(buildJoinedUniqueCountColumnName(s.aliasPath))
      );
      // `a.b` and a top-level `a_b` build the SAME name. Advertising both would let the splitter
      // resolve it to whichever came last and answer with the wrong Data Mart's count, silently —
      // the save-time collision check never fires, because only one alias path survives. First
      // wins, as the picker already resolves it.
      const takenNames = new Set<string>();
      for (const s of eligibleSources) {
        const name = buildJoinedUniqueCountColumnName(s.aliasPath);
        if (takenNames.has(name)) continue;
        takenNames.add(name);
        // The same formatter every ordinary joined field above goes through, so the metric reads
        // like one; MCP carries no destination, so it keeps the prefix style.
        const displayName = formatBlendedFieldDisplayName({
          name: UNIQUE_COUNT_LABEL,
          outputPrefix: s.defaultAlias,
        });
        uniqueCountSources.push({ aliasPath: s.aliasPath, name, displayName });
        uniqueCountFields.push({
          name,
          displayName,
          type: 'INTEGER',
          description: `Number of unique ${s.title} records, counted by that Data Mart's primary key.`,
          sourceDataMart: s.title,
          // A pseudo-field IS the aggregate; further aggregating it is not supported.
          allowedAggregations: [],
        });
      }

      return { joinedFields: [...blendedFields, ...uniqueCountFields], joins, uniqueCountSources };
    } catch (err) {
      this.logger.warn(
        `resolveJoinedFields failed; returning no joined fields: ${err instanceof Error ? err.message : String(err)}`
      );
      return { joinedFields: [], joins: [], uniqueCountSources: [] };
    }
  }

  /**
   * The join-tree edges behind the accessible sources — every source was pulled through exactly
   * one relationship (`relationshipId`), including transitive ones, so one lookup by ids covers
   * the whole tree. Gives the model the join keys and the analyst-written join description that
   * `joinedFields` alone cannot carry. The description is the EFFECTIVE one the blendable schema
   * resolved per node — the per-join override when set, otherwise the relationship-level text —
   * so the same relationship reached through different join paths can explain each path's own
   * business context.
   *
   * Failure here degrades only `joins` to [] — by this point the blendable schema has already
   * resolved, and this extra lookup must not take the joined fields down with it.
   */
  private async resolveJoins(
    accessibleSources: Array<{
      aliasPath: string;
      relationshipId: string;
      joinDescription?: string;
    }>
  ): Promise<McpJoinDto[]> {
    try {
      const relationshipsById = new Map(
        (
          await this.relationshipService.findByIds(accessibleSources.map(s => s.relationshipId))
        ).map(rel => [rel.id, rel])
      );

      const joins: McpJoinDto[] = [];
      for (const source of accessibleSources) {
        const rel = relationshipsById.get(source.relationshipId);
        if (!rel?.sourceDataMart || !rel.targetDataMart) continue;
        joins.push({
          aliasPath: source.aliasPath,
          sourceDataMart: rel.sourceDataMart.title,
          targetDataMart: rel.targetDataMart.title,
          joinConditions: rel.joinConditions,
          ...(source.joinDescription ? { description: source.joinDescription } : {}),
        });
      }
      return joins;
    } catch (err) {
      this.logger.warn(
        `resolveJoins failed; returning joined fields without joins: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }
  }

  async queryDataMart(
    request: McpQueryDataMartRequest,
    signal?: AbortSignal
  ): Promise<McpQueryDataMartResponse> {
    return this.queryDataMartService.run(new QueryDataMartCommand(request), signal);
  }

  async summarizeDataCatalog(
    request: McpSummarizeDataCatalogRequest
  ): Promise<McpDataCatalogSummaryResponse> {
    return this.summarizeMcpDataCatalogService.run(
      new SummarizeMcpDataCatalogCommand(request.projectId, request.userId, request.roles)
    );
  }

  private async ensurePublishedDataMartAccessible(
    request: McpGetDataMartDetailsRequest
  ): Promise<void> {
    const dataMart = await this.getDataMartService.run(
      new GetDataMartCommand(request.dataMartId, request.projectId, request.userId, request.roles)
    );
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      // Do not reveal whether a non-published Data Mart exists.
      throw new NotFoundException('Data Mart not found');
    }
  }

  // Only top-level names can collide with a `<alias>__unique_count` pseudo-field: a nested
  // field is addressed as `parent.child`, which never has that shape.
  private topLevelFieldNames(fields: Array<Record<string, unknown>>): ReadonlySet<string> {
    return new Set(
      fields.map(f => f['name']).filter((name): name is string => typeof name === 'string')
    );
  }

  private withDisplayNames(fields: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return fields.map(field => {
      const name = typeof field['name'] === 'string' ? field['name'] : undefined;
      const businessName =
        typeof field['businessName'] === 'string' && field['businessName'].trim()
          ? field['businessName'].trim()
          : undefined;
      const nestedFields = Array.isArray(field['fields'])
        ? this.withDisplayNames(field['fields'] as Array<Record<string, unknown>>)
        : undefined;

      return {
        ...field,
        ...(name ? { displayName: businessName ?? name } : {}),
        ...(nestedFields ? { fields: nestedFields } : {}),
      };
    });
  }

  private filterAvailableFields(fields: DataMartSchemaField[]): DataMartSchemaField[] {
    return fields
      .filter(field => isConnected(field) && !field.isHiddenForReporting)
      .map(field => {
        if (!('fields' in field) || !Array.isArray(field.fields)) {
          return field;
        }

        return {
          ...field,
          fields: this.filterAvailableFields(field.fields as DataMartSchemaField[]),
        } as DataMartSchemaField;
      });
  }
}
