import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { ValidationResult } from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { PublishDataStorageDraftsResultDto } from '../dto/domain/publish-data-storage-drafts-result.dto';
import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';
import { ValidateDataStorageAccessCommand } from '../dto/domain/validate-data-storage-access.command';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { SchemaActualizeTriggerService } from '../services/schema-actualize-trigger.service';
import { PUBLISH_DATA_MART_ERRORS, PublishDataMartService } from './publish-data-mart.service';
import { ValidateDataStorageAccessService } from './validate-data-storage-access.service';

/** Reasons the publish path authors itself; anything else is not shown to users. */
const USER_FACING_FAILURE_REASONS: ReadonlySet<string> = new Set(
  Object.values(PUBLISH_DATA_MART_ERRORS)
);

const GENERIC_FAILURE_REASON = 'Publishing failed. Open the Data Mart to see details.';

/** Surfaced as the trigger-level error when the publisher's roles cannot be resolved. */
const UNRESOLVED_ROLES_ERROR =
  'Could not determine your project permissions. No Data Mart drafts were published.';

/** Same, but for a failed lookup rather than a definitive empty answer — retrying may help. */
const PERMISSIONS_LOOKUP_FAILED_ERROR =
  'Could not verify your project permissions. No Data Mart drafts were published. Please try again.';

/** Fallback when the storage check failed for a reason this codebase did not author. */
const STORAGE_ACCESS_FAILED_ERROR =
  'Could not access this Storage. Check its connection settings and try again.';

/**
 * A ValidationResult only carries a `code` when this codebase authored the
 * message (`unconfigured`, `oauthReauthRequired`). A bare `failure()` can hold
 * raw text from credential resolution or a warehouse driver, which must not
 * reach the browser.
 */
function toUserFacingStorageError(result: ValidationResult): string {
  return result.code && result.errorMessage ? result.errorMessage : STORAGE_ACCESS_FAILED_ERROR;
}

@Injectable()
export class PublishDataStorageDraftsService {
  private readonly logger = new Logger(PublishDataStorageDraftsService.name);

  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly dataMartService: DataMartService,
    private readonly publishDataMartService: PublishDataMartService,
    private readonly schemaActualizeTriggerService: SchemaActualizeTriggerService,
    private readonly validateDataStorageAccessService: ValidateDataStorageAccessService,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  async run(command: PublishDataStorageDraftsCommand): Promise<PublishDataStorageDraftsResultDto> {
    this.logger.log(
      `Publishing drafts for data storage ${command.dataStorageId} in project ${command.projectId} by user ${command.userId}`
    );

    const dataStorage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.dataStorageId
    );

    const validationResult = await this.validateDataStorageAccessService.run(
      new ValidateDataStorageAccessCommand(command.dataStorageId, command.projectId)
    );

    if (!validationResult.valid) {
      throw new BusinessViolationException(toUserFacingStorageError(validationResult));
    }

    const draftIds = await this.dataMartService.findDraftIdsByStorage(dataStorage);

    // Nothing to authorize: skip the remote role lookup so an unrelated IDP
    // blip cannot turn "no drafts to publish" into a hard error.
    if (draftIds.length === 0) {
      return new PublishDataStorageDraftsResultDto(0, 0);
    }

    const roles = await this.resolvePublisherRoles(command);

    let successCount = 0;
    let failedCount = 0;
    // Deduplicated: the caller only needs to know why, not which draft.
    const failureReasons = new Set<string>();

    for (const draftId of draftIds) {
      try {
        await this.publishDataMartService.run(
          new PublishDataMartCommand(
            draftId,
            command.projectId,
            command.userId,
            roles,
            command.userId
          )
        );
        ++successCount;
      } catch (error) {
        this.logger.warn(
          `Failed to publish draft ${draftId}: ${error instanceof Error ? error.message : String(error)}`,
          { stack: error instanceof Error ? error.stack : undefined }
        );
        failureReasons.add(this.toUserFacingReason(error));
        ++failedCount;
        continue;
      }

      // The draft is published and saved by this point. Scheduling schema
      // actualization is a follow-up, so its failure must not be reported as a
      // publish failure: that would send the user to a DRAFT-filtered list the
      // Data Mart is no longer in, and a retry would say it is already published.
      try {
        await this.schemaActualizeTriggerService.createTrigger(
          command.userId,
          command.projectId,
          draftId
        );
      } catch (error) {
        this.logger.warn(
          `Published draft ${draftId} but failed to schedule schema actualization: ` +
            (error instanceof Error ? error.message : String(error)),
          { stack: error instanceof Error ? error.stack : undefined }
        );
      }
    }

    return new PublishDataStorageDraftsResultDto(successCount, failedCount, [...failureReasons]);
  }

  /**
   * Resolves the publisher's current roles for the per-draft EDIT check. The
   * trigger is processed asynchronously with no live request, so roles cannot
   * be read from a JWT and are fetched fresh here.
   *
   * An unresolved role list must never fall back to `[]`: AccessDecisionService
   * resolves `[]` to VIEWER, which fails every draft with a permission error
   * indistinguishable from the user genuinely lacking access — the same silent
   * all-fail this service was fixed to eliminate. Fail loudly instead.
   */
  private async resolvePublisherRoles(command: PublishDataStorageDraftsCommand): Promise<string[]> {
    // Without a userId, PublishDataMartService skips its access check entirely
    // (`if (command.userId)`), which would publish every draft unauthorized.
    // The trigger column is non-nullable, so this is a guard, not a code path.
    if (!command.userId) {
      this.logger.error(
        `Publish drafts trigger for storage ${command.dataStorageId} has no userId; refusing to publish unauthorized`
      );
      throw new BusinessViolationException(UNRESOLVED_ROLES_ERROR);
    }

    const project = await this.idpProjectionsFacade
      .getProjectForUser(command.userId, command.projectId)
      .catch((error: unknown) => {
        // 403/404 from Identity are definitive (identity blocked, or the user
        // was removed from the project between trigger creation and
        // processing); telling those users to retry would loop forever.
        const status = (error as { status?: number } | null)?.status;
        const isDefinitive = status === 403 || status === 404;

        this.logger.warn(
          `Failed to resolve roles for user ${command.userId} in project ${command.projectId}: ` +
            (error instanceof Error ? error.message : String(error)),
          { stack: error instanceof Error ? error.stack : undefined, status }
        );
        throw new BusinessViolationException(
          isDefinitive ? UNRESOLVED_ROLES_ERROR : PERMISSIONS_LOOKUP_FAILED_ERROR
        );
      });

    if (!project?.roles?.length) {
      // Error, not warn: Identity answered successfully but omitted roles, which
      // means every bulk publish in this deployment will fail. That is a contract
      // problem worth surfacing, not routine noise.
      this.logger.error(
        `No roles resolved for user ${command.userId} in project ${command.projectId}; ` +
          'refusing to publish drafts as an implicit viewer'
      );
      throw new BusinessViolationException(UNRESOLVED_ROLES_ERROR);
    }

    return project.roles;
  }

  /**
   * Publish failures are returned to the browser and readable by any project
   * viewer, so only reasons this codebase authored are echoed back. Errors from
   * deeper in the publish path (storage drivers, warehouse dry-run validation)
   * can embed SQL, table paths or credential hints and are replaced with a
   * generic reason; the full error stays in the server log above.
   */
  private toUserFacingReason(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    return USER_FACING_FAILURE_REASONS.has(message) ? message : GENERIC_FAILURE_REASON;
  }
}
