import { Injectable, Logger } from '@nestjs/common';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { ResolveSourceDataLastUpdatedItem } from '../data-storage-types/interfaces/source-data-last-updated-resolver.interface';
import { RefreshDataMartDataLastUpdatedCommand } from '../dto/domain/refresh-data-mart-data-last-updated.command';
import { SourceDataLastUpdated } from '../dto/schemas/source-data-last-updated.schema';
import { DataMart } from '../entities/data-mart.entity';
import { Action, AccessDecisionService, EntityType } from '../services/access-decision';
import { DataMartService } from '../services/data-mart.service';
import { SourceDataLastUpdatedService } from '../services/source-data-last-updated.service';

/**
 * The user-triggered "how current is this?" check behind the refresh affordances on the Data Mart
 * page and the model canvas.
 *
 * Batch-shaped on purpose. The canvas asks about every Data Mart it is showing, and those all
 * share one storage, so measuring them together lets the resolver stand up a single warehouse
 * client for the sweep instead of one per Data Mart.
 *
 * Scope is deliberately each Data Mart's OWN definition — the SQL is built from the definition,
 * not from any report or blend — so a persisted value always means "the sources of THIS Data
 * Mart". (Blended MCP queries measure a wider source set; they journal into their run record and
 * must not overwrite this narrower value.)
 *
 * Reads the warehouse but registers no consumption and records no run: this is metadata about the
 * Data Mart, computed on explicit user demand, mirroring the meeting decision that the canvas
 * trigger must be free. Data Marts that cannot be measured are simply absent from the result —
 * the caller keeps whatever it had rather than seeing an error.
 */
@Injectable()
export class RefreshDataMartDataLastUpdatedService {
  private readonly logger = new Logger(RefreshDataMartDataLastUpdatedService.name);

  /**
   * A sweep covers a whole canvas, so it gets a far larger ceiling than the per-run lookup that
   * rides along with a query. Data Marts still unmeasured when it expires keep their previous
   * value; nothing is cleared.
   */
  private static readonly BATCH_SOFT_TIMEOUT_MS = 120_000;

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly queryBuilderFacade: DataMartQueryBuilderFacade,
    private readonly sourceDataLastUpdatedService: SourceDataLastUpdatedService
  ) {}

  async run(
    command: RefreshDataMartDataLastUpdatedCommand
  ): Promise<Map<string, SourceDataLastUpdated>> {
    const results = new Map<string, SourceDataLastUpdated>();
    if (command.ids.length === 0) {
      return results;
    }

    const dataMarts = await this.dataMartService.findByIdsAndProjectIdForSourceLookup(
      command.ids,
      command.projectId
    );
    if (dataMarts.length === 0) {
      return results;
    }

    const access = await this.accessDecisionService.canAccessMany(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      dataMarts.map(dataMart => dataMart.id),
      Action.SEE,
      command.projectId
    );

    // Group by storage so each warehouse client is built once, however many Data Marts sit on it.
    const byStorage = new Map<string, { storage: DataMart['storage']; dataMarts: DataMart[] }>();
    for (const dataMart of dataMarts) {
      // A Data Mart the caller cannot see, or a draft with no definition to measure, is silently
      // absent from the result — indistinguishable from one that simply could not be resolved.
      if (!access.get(dataMart.id) || !dataMart.definitionType || !dataMart.definition) {
        continue;
      }
      const group = byStorage.get(dataMart.storage.id);
      if (group) {
        group.dataMarts.push(dataMart);
      } else {
        byStorage.set(dataMart.storage.id, { storage: dataMart.storage, dataMarts: [dataMart] });
      }
    }

    for (const { storage, dataMarts: group } of byStorage.values()) {
      const items = await this.buildItems(group);
      if (items.length === 0) {
        continue;
      }

      const resolved = await this.sourceDataLastUpdatedService.resolveForSqlBatch({
        storage,
        items,
        softTimeoutMs: RefreshDataMartDataLastUpdatedService.BATCH_SOFT_TIMEOUT_MS,
      });

      for (const [dataMartId, block] of resolved) {
        results.set(dataMartId, block);
        // Persist only what actually resolved: a failed lookup must not erase yesterday's answer,
        // it just returns unknown to this caller.
        if (block.dataLastUpdatedAt !== null) {
          await this.persist(dataMartId, command.projectId, block);
        }
      }
    }

    return results;
  }

  private async buildItems(dataMarts: DataMart[]): Promise<ResolveSourceDataLastUpdatedItem[]> {
    const items: ResolveSourceDataLastUpdatedItem[] = [];
    for (const dataMart of dataMarts) {
      try {
        const built = await this.queryBuilderFacade.buildQuery(
          dataMart.storage.type,
          dataMart.definition!
        );
        items.push(
          typeof built === 'string'
            ? { key: dataMart.id, sql: built }
            : { key: dataMart.id, sql: built.sql, params: built.params }
        );
      } catch (error) {
        // An unbuildable definition (mid-edit, unsupported storage) drops out of the batch the
        // same way any other unmeasurable Data Mart does.
        this.logger.warn(
          `Could not build source query for data mart ${dataMart.id}; skipping: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    return items;
  }

  private async persist(
    dataMartId: string,
    projectId: string,
    block: SourceDataLastUpdated
  ): Promise<void> {
    try {
      await this.dataMartService.updateDataLastUpdated(dataMartId, projectId, block);
    } catch (error) {
      this.logger.warn(
        `Failed to persist data last updated for data mart ${dataMartId}; returning the fresh value anyway: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
