import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMart } from '../entities/data-mart.entity';
import { calculatedFieldsOf } from '../calculated-fields/calculated-field.utils';
import {
  CalculatedFieldValidatorService,
  DryRunContext,
} from '../calculated-fields/calculated-field-validator.service';
import { FormulaViolations } from '../calculated-fields/formula-violations';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import { DataMartSchemaParserFacade } from '../data-storage-types/facades/data-mart-schema-parser-facade.service';
import { UpdateDataMartSchemaCommand } from '../dto/domain/update-data-mart-schema.command';
import { UpdateDataMartSchemaResult } from '../dto/domain/update-data-mart-schema-result.dto';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { DataMartSearchIndexInvalidationService } from '../services/data-mart-search-index-invalidation.service';

@Injectable()
export class UpdateDataMartSchemaService {
  private readonly logger = new Logger(UpdateDataMartSchemaService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly schemaParserFacade: DataMartSchemaParserFacade,
    private readonly calculatedFieldValidator: CalculatedFieldValidatorService,
    private readonly mapper: DataMartMapper,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly credentialsResolver: DataStorageCredentialsResolver,
    private readonly searchIndexInvalidation?: DataMartSearchIndexInvalidationService
  ) {}

  async run(command: UpdateDataMartSchemaCommand): Promise<UpdateDataMartSchemaResult> {
    this.logger.debug(`Updating data mart ${command.id} schema ${command.schema}`);
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to edit this DataMart');
      }
    }

    const parsed = await this.schemaParserFacade.validateAndParse(
      command.schema,
      dataMart.storage.type
    );

    // Assigned BEFORE the dry run, not after: composeMetricsOnly (via CalculatedFieldValidatorService)
    // reads `ctx.dataMart.schema` to find each metric's formula, so the context below must carry
    // the schema BEING SAVED, never the stale one still in the database — otherwise a brand-new
    // metric is dry-run as an unknown column, and an edited formula's OLD text is what actually
    // gets validated while the new one is persisted as `warehouseValidation: 'passed'`. Safe to
    // assign here: `dataMart` stays unsaved until `dataMartService.save` below, so a validation
    // failure afterwards just leaves the in-memory mutation unpersisted.
    dataMart.schema = parsed;

    const calculatedFields = calculatedFieldsOf(parsed.fields);
    const storageConfig = dataMart.storage.config;
    // Storage can exist without being fully configured yet (created, then wired to a warehouse in
    // a later step) — a reachable state, not a corner case.
    const storageNotConfigured = calculatedFields.length > 0 && !storageConfig;

    // Resolving credentials can mean a real round trip (e.g. a BigQuery OAuth token exchange), so
    // it only runs when the schema actually carries a formula to dry-run — most saves (renames,
    // hidden-field toggles, no calculated fields at all) never touch it.
    //
    // And it can fail on its own terms: a storage configured without a linked credential throws,
    // and the BigQuery OAuth branch throws on a revoked grant. Unhandled, that failure sat BETWEEN
    // the two guards that already degrade — unconfigured storage, unreachable warehouse — and
    // turned every save carrying a formula into a 500, including the save that REMOVES the
    // formula. It gets the same answer as those two: the check did not happen, so say so and save.
    let ctx: DryRunContext | undefined;
    let credentialsUnavailable = false;
    if (storageConfig && calculatedFields.length > 0) {
      try {
        ctx = {
          dataMart,
          storageType: dataMart.storage.type,
          credentials: await this.credentialsResolver.resolve(dataMart.storage),
          config: storageConfig,
        };
      } catch (e) {
        this.logger.warn(
          `Credentials unavailable for data mart ${command.id}; ` +
            `saving with the warehouse check skipped: ${e instanceof Error ? e.message : String(e)}`
        );
        credentialsUnavailable = true;
      }
    }

    const { errors, warnings, warehouseValidation } = await this.calculatedFieldValidator.validate(
      parsed,
      dataMart.storage.type,
      ctx,
      // Passed whether or not the storage is configured: a joined reference resolves against the
      // Data Mart's relationships, which exist independently of the warehouse.
      {
        dataMartId: dataMart.id,
        projectId: command.projectId,
        accessor: { userId: command.userId, roles: command.roles },
      }
    );
    if (errors.length > 0) {
      // All violations in one round trip: the editor shows every offending field at once, instead
      // of making the analyst rediscover them one save at a time.
      throw new BusinessViolationException('Calculated field validation failed', { errors });
    }

    // Storage not being configured yet, and credentials that cannot be resolved, are both treated
    // exactly like the warehouse being unreachable: the save still succeeds, but silently — no
    // warning, no stamp — would hide that the formula was never actually checked. `ctx` is
    // guaranteed undefined in both cases, so `warehouseValidation` from the validator is always
    // undefined too; this is the only source of the 'skipped' outcome for them.
    const warehouseCheckSkipped = storageNotConfigured || credentialsUnavailable;
    if (warehouseCheckSkipped) {
      warnings.push(FormulaViolations.warehouseCheckSkipped(calculatedFields.map(f => f.name)));
    }
    const effectiveWarehouseValidation = warehouseCheckSkipped ? 'skipped' : warehouseValidation;

    // A `skipped` metric must be re-checked on the next save, and a `passed`
    // one carries proof it was. Both need the stamp to actually reach the persisted field —
    // computing it and never writing it down defeats the point.
    if (effectiveWarehouseValidation) {
      for (const field of calculatedFields) {
        field.calculated.warehouseValidation = effectiveWarehouseValidation;
      }
    }

    await this.saveAndInvalidate(dataMart);
    await this.searchIndexInvalidation?.scheduleDataMartSchemaChanged(
      dataMart.id,
      command.projectId
    );

    this.logger.debug(`Data mart ${command.id} schema updated`);
    return { ...this.mapper.toDomainDto(dataMart), warnings };
  }

  /**
   * The persistence pair, committed or rolled back together.
   *
   * A cached Looker Studio reader is keyed on the report and an expiry alone — nothing in the key
   * fingerprints the schema — so without the invalidation an edited formula keeps serving the OLD
   * formula's numbers under the OLD headers until `cacheLifetime` (min 60s, no upper bound) runs
   * out. Same call as the sibling mutators that already invalidate on a schema-shaping change
   * (UpdateBlendedFieldsConfigService, Update/DeleteDataMartRelationshipService), and transactional
   * for the same reason they are: if the save autocommits and the invalidation then fails, the new
   * formula is durably stored, the request 500s — so the editor reports a failed save and keeps
   * the analyst's edits marked unsaved — and the stale cache serves the old formula's numbers for
   * up to the cache lifetime. That is precisely the window this call exists to close.
   *
   * Scoped to these two statements rather than declared on `run`, because `run` awaits a warehouse
   * dry run, and holding a database transaction open across that round trip would trade one
   * problem for a slower one.
   */
  @Transactional()
  private async saveAndInvalidate(dataMart: DataMart): Promise<void> {
    await this.dataMartService.save(dataMart);
    await this.reportDataCacheService.invalidateByDataMartId(dataMart.id);
  }
}
