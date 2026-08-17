import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import {
  ValidationResult,
  ValidationResultCode,
} from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { DataMartValidationCode } from '../data-storage-types/interfaces/data-mart-validator.interface';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { PublishDataStorageDraftsResultDto } from '../dto/domain/publish-data-storage-drafts-result.dto';
import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';
import { ValidateDataStorageAccessCommand } from '../dto/domain/validate-data-storage-access.command';
import { DataMartService } from '../services/data-mart.service';
import { DataStorageService } from '../services/data-storage.service';
import { SchemaActualizeTriggerService } from '../services/schema-actualize-trigger.service';
import {
  PUBLISH_DATA_MART_ERRORS,
  PublishDataMartService,
  PublishForbiddenException,
} from './publish-data-mart.service';
import { ValidateDataStorageAccessService } from './validate-data-storage-access.service';

/**
 * Failure codes whose message this codebase authored. Sanitization keys on the
 * code rather than the text, so an authored message is safe because it is
 * tagged as ours — not because its bytes match a list.
 */
const USER_FACING_FAILURE_CODES: ReadonlySet<string> = new Set<string>([
  ...Object.values(PUBLISH_DATA_MART_ERRORS).map(error => error.code),
  // Listed one by one rather than spread from the enum: a code added there in
  // another module must not become user-facing here without a deliberate edit.
  DataMartValidationCode.INVALID_IDENTIFIER_FORMAT,
  DataMartValidationCode.DEFINITION_NOT_FOUND,
  DataMartValidationCode.STORAGE_CONFIG_NOT_FOUND,
  DataMartValidationCode.STORAGE_CREDENTIALS_NOT_FOUND,
]);

const GENERIC_FAILURE_REASON = 'Publishing failed. Open the Data Mart to see details.';

/**
 * Storage-access validation codes this service is willing to echo, each mapped
 * to its own trigger-level code so the pairing stays truthful.
 */
const STORAGE_VALIDATION_CODES: Readonly<Record<string, string>> = {
  [ValidationResultCode.UNCONFIGURED]: 'PUBLISH_DRAFTS_STORAGE_UNCONFIGURED',
  [ValidationResultCode.OAUTH_REAUTH_REQUIRED]: 'PUBLISH_DRAFTS_STORAGE_OAUTH_REAUTH_REQUIRED',
};

/**
 * Trigger-level failures raised by this service. Each carries a code so the
 * handler can tell authored text from an infrastructure error's message.
 */
export const PUBLISH_DRAFTS_ERRORS = {
  UNRESOLVED_ROLES: {
    code: 'PUBLISH_DRAFTS_UNRESOLVED_ROLES',
    message: 'Could not determine your project permissions. No Data Mart drafts were published.',
  },
  /** A failed lookup rather than a definitive empty answer — retrying may help. */
  PERMISSIONS_LOOKUP_FAILED: {
    code: 'PUBLISH_DRAFTS_PERMISSIONS_LOOKUP_FAILED',
    message:
      'Could not verify your project permissions. No Data Mart drafts were published. Please try again.',
  },
  STORAGE_ACCESS: {
    code: 'PUBLISH_DRAFTS_STORAGE_ACCESS',
    message: 'Could not access this Storage. Check its connection settings and try again.',
  },
} as const;

/**
 * Codes this service raises at trigger level. The handler allowlists these
 * rather than trusting any coded BusinessViolationException: a code proves the
 * thrower opted in, not that *this* path authored the text.
 */
export const PUBLISH_DRAFTS_TRIGGER_ERROR_CODES: ReadonlySet<string> = new Set<string>([
  ...Object.values(PUBLISH_DRAFTS_ERRORS).map(error => error.code),
  ...Object.values(STORAGE_VALIDATION_CODES),
]);

/**
 * A storage ValidationResult only carries a `code` when this codebase authored
 * the message (`unconfigured`, `oauthReauthRequired`). A bare `failure()` can
 * hold raw text from credential resolution or a warehouse driver, which must
 * not reach the browser.
 */
function toStorageAccessError(result: ValidationResult): BusinessViolationException {
  // Keep code and message describing the same failure: reusing one generic code
  // for an authored message would tell a client branching on it to check
  // connection settings when the fix is, say, reconnecting Google.
  const authoredCode = result.code ? STORAGE_VALIDATION_CODES[result.code] : undefined;
  if (authoredCode && result.errorMessage) {
    return new BusinessViolationException(result.errorMessage, undefined, authoredCode);
  }
  return publishDraftsError(PUBLISH_DRAFTS_ERRORS.STORAGE_ACCESS);
}

/** Builds a trigger-level failure with its stable code attached; the caller throws. */
function publishDraftsError(spec: { code: string; message: string }): BusinessViolationException {
  return new BusinessViolationException(spec.message, undefined, spec.code);
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
      throw toStorageAccessError(validationResult);
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
      throw publishDraftsError(PUBLISH_DRAFTS_ERRORS.UNRESOLVED_ROLES);
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
        throw publishDraftsError(
          isDefinitive
            ? PUBLISH_DRAFTS_ERRORS.UNRESOLVED_ROLES
            : PUBLISH_DRAFTS_ERRORS.PERMISSIONS_LOOKUP_FAILED
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
      throw publishDraftsError(PUBLISH_DRAFTS_ERRORS.UNRESOLVED_ROLES);
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
    if (error instanceof BusinessViolationException && error.code) {
      return USER_FACING_FAILURE_CODES.has(error.code) ? error.message : GENERIC_FAILURE_REASON;
    }

    // Permission denials stay a 403 for API clients, so they cannot be a coded
    // BusinessViolationException; PublishForbiddenException carries the code
    // instead, keeping this a type-and-code match rather than a text match.
    if (error instanceof PublishForbiddenException && USER_FACING_FAILURE_CODES.has(error.code)) {
      return error.message;
    }

    return GENERIC_FAILURE_REASON;
  }
}
