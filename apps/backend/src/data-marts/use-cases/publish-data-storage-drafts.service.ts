import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { PublishDataStorageDraftsResultDto } from '../dto/domain/publish-data-storage-drafts-result.dto';
import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';
import { PublishDraftFailureDto } from '../dto/domain/publish-draft-failure.dto';
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
      throw new BusinessViolationException(
        validationResult.errorMessage ?? 'Data storage access validation failed'
      );
    }

    const drafts = await this.dataMartService.findDraftsByStorage(dataStorage);

    // Nothing to authorize: skip the remote role lookup so an unrelated IDP
    // blip cannot turn "no drafts to publish" into a hard error.
    if (drafts.length === 0) {
      return new PublishDataStorageDraftsResultDto(0, 0);
    }

    const roles = command.userId ? await this.resolvePublisherRoles(command) : [];

    let successCount = 0;
    let failedCount = 0;
    const failures: PublishDraftFailureDto[] = [];

    for (const draft of drafts) {
      try {
        await this.publishDataMartService.run(
          new PublishDataMartCommand(
            draft.id,
            command.projectId,
            command.userId,
            roles,
            command.userId
          )
        );
        ++successCount;
      } catch (error) {
        this.logger.warn(
          `Failed to publish draft ${draft.id}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined
        );
        failures.push(
          new PublishDraftFailureDto(draft.id, draft.title, this.toUserFacingReason(error))
        );
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
          draft.id
        );
      } catch (error) {
        this.logger.warn(
          `Published draft ${draft.id} but failed to schedule schema actualization: ` +
            (error instanceof Error ? error.message : String(error)),
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    return new PublishDataStorageDraftsResultDto(successCount, failedCount, failures);
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
    const project = await this.idpProjectionsFacade
      .getProjectForUser(command.userId, command.projectId)
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to resolve roles for user ${command.userId} in project ${command.projectId}: ` +
            (error instanceof Error ? error.message : String(error)),
          error instanceof Error ? error.stack : undefined
        );
        throw new BusinessViolationException(PERMISSIONS_LOOKUP_FAILED_ERROR);
      });

    if (!project?.roles?.length) {
      this.logger.warn(
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
