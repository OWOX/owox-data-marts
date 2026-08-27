import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { RelationshipDto } from '../dto/domain/relationship.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';
import { DataMart } from '../entities/data-mart.entity';
import { calculatedFieldsOf } from '../calculated-fields/calculated-field.utils';
import {
  parseFormulaReferences,
  renderFormula,
  serializeFormulaReference,
} from '../calculated-fields/formula-reference';

@Injectable()
export class UpdateDataMartRelationshipService {
  private readonly logger = new Logger(UpdateDataMartRelationshipService.name);

  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly mapper: RelationshipMapper,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  @Transactional()
  async run(command: UpdateRelationshipCommand): Promise<RelationshipDto> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    await this.dataMartService.getByIdAndProjectId(command.sourceDataMartId, command.projectId);

    const relationship = await this.relationshipService.findById(command.relationshipId);

    if (!relationship || relationship.sourceDataMart.id !== command.sourceDataMartId) {
      throw new NotFoundException(
        `Relationship with ID ${command.relationshipId} not found for data mart ${command.sourceDataMartId}`
      );
    }

    const canEdit = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      relationship.sourceDataMart.id,
      Action.EDIT,
      command.projectId
    );
    if (!canEdit) {
      throw new ForbiddenException(
        'You do not have permission to manage relationships of this DataMart'
      );
    }

    const oldAlias = relationship.targetAlias;

    if (command.targetAlias !== undefined && command.targetAlias !== oldAlias) {
      await this.relationshipService.validateUniqueAlias(
        command.sourceDataMartId,
        command.targetAlias,
        command.relationshipId
      );
    }

    if (command.joinConditions !== undefined) {
      // See CreateDataMartRelationshipService: a field the schema cannot confirm is a warning,
      // not a rejection — but it must reach the log rather than be discarded.
      const { warnings } = this.relationshipService.validateJoinFieldTypes(
        relationship.sourceDataMart.schema,
        relationship.targetDataMart.schema,
        command.joinConditions
      );
      if (warnings.length > 0) {
        this.logger.warn(
          `Relationship ${command.relationshipId} saved with unverifiable join field(s): ` +
            `${warnings.join('; ')}`
        );
      }
    }

    const updated = await this.relationshipService.update(relationship, command);

    if (command.targetAlias !== undefined && command.targetAlias !== oldAlias) {
      await this.cascadeAliasRename(command.sourceDataMartId, oldAlias, command.targetAlias);
    }

    await this.reportDataCacheService.invalidateByDataMartId(command.sourceDataMartId);

    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_MART,
      command.sourceDataMartId,
      command.projectId
    );

    const [createdByUser, targetHasAccess] = await Promise.all([
      this.userProjectionsFetcherService.fetchCreatedByUser(updated),
      this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        updated.targetDataMart.id,
        Action.SEE,
        command.projectId
      ),
    ]);
    const accessByDataMartId = new Map<string, boolean>([
      [updated.sourceDataMart.id, true],
      [updated.targetDataMart.id, targetHasAccess],
    ]);
    return this.mapper.toDomainDto(updated, createdByUser, accessByDataMartId);
  }

  /**
   * Routed through `rewriteSchemaPaths` rather than load-mutate-save: that helper re-reads the row
   * under a write lock and updates only the two columns this rename owns, so a formula an analyst
   * saved earlier in this request is renamed rather than discarded. See its docblock for what the
   * guard does and does not buy.
   */
  private async cascadeAliasRename(
    sourceDataMartId: string,
    oldAlias: string,
    newAlias: string
  ): Promise<void> {
    await this.dataMartService.rewriteSchemaPaths(sourceDataMartId, sourceDm => {
      const configChanged = this.renameBlendedConfigPaths(sourceDm, oldAlias, newAlias);
      const formulasChanged = this.renameFormulaPaths(sourceDm, oldAlias, newAlias);
      return configChanged || formulasChanged;
    });
  }

  private renameBlendedConfigPaths(
    dataMart: DataMart,
    oldAlias: string,
    newAlias: string
  ): boolean {
    if (!dataMart.blendedFieldsConfig) return false;

    let changed = false;
    const updatedSources = dataMart.blendedFieldsConfig.sources.map(source => {
      const updatedPath = this.replaceFirstSegment(source.path, oldAlias, newAlias);
      if (updatedPath !== source.path) {
        changed = true;
        return { ...source, path: updatedPath };
      }
      return source;
    });

    if (changed) {
      dataMart.blendedFieldsConfig = {
        ...dataMart.blendedFieldsConfig,
        sources: updatedSources,
      };
    }
    return changed;
  }

  /**
   * Rewrites the alias inside every stored formula that reads the renamed source
   * (`{{ref path="orders" field="amount"}}`). A formula's `path` is the same structural
   * alias path a blended-fields config carries, so a rename that reaches one and not the other
   * turns a working metric into a broken one at the next read.
   *
   * Only the FIRST segment is replaced, exactly as the config's own path is: this cascade runs on
   * the relationship's SOURCE Data Mart, where the renamed alias is by construction the first
   * segment. A Data Mart further up the tree names the same relationship as a LATER segment
   * (`orders.items`) and is never visited, so its formula degrades to broken-with-reason — reported
   * through `calculatedFieldIssues` rather than failing silently. That gap is the cascade's
   * pre-existing shape, inherited here rather than introduced.
   */
  private renameFormulaPaths(dataMart: DataMart, oldAlias: string, newAlias: string): boolean {
    let changed = false;
    for (const field of calculatedFieldsOf(dataMart.schema?.fields ?? [])) {
      const stored = field.calculated.formula;
      try {
        const refs = parseFormulaReferences(stored);
        if (!refs.some(r => this.replaceFirstSegment(r.path, oldAlias, newAlias) !== r.path)) {
          continue;
        }
        field.calculated.formula = renderFormula(stored, ref =>
          serializeFormulaReference({
            path: this.replaceFirstSegment(ref.path, oldAlias, newAlias),
            field: ref.field,
          })
        );
        changed = true;
      } catch {
        // A formula that cannot be parsed or re-serialized is already broken, and blocking the
        // rename over it would leave the analyst no way to repair either.
        this.logger.warn(
          `Data Mart ${dataMart.id}: could not rewrite the joined path of calculated field ` +
            `"${field.name}" while renaming "${oldAlias}" to "${newAlias}"`
        );
      }
    }
    return changed;
  }

  private replaceFirstSegment(path: string, oldSegment: string, newSegment: string): string {
    if (path === oldSegment) return newSegment;
    if (path.startsWith(`${oldSegment}.`)) {
      return `${newSegment}${path.slice(oldSegment.length)}`;
    }
    return path;
  }
}
