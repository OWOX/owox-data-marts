import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { DataStorageAccessValidatorFacade } from '../data-storage-types/facades/data-storage-access-validator-facade.service';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import {
  ValidationResult,
  ValidationResultCode,
} from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { ValidateDataStorageAccessCommand } from '../dto/domain/validate-data-storage-access.command';
import { DataStorageService } from '../services/data-storage.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { StorageCredentialUnavailableException } from '../exceptions/storage-credential-unavailable.exception';
import { CredentialsExpiredException } from '../exceptions/google-oauth.exceptions';

const GOOGLE_OAUTH_REAUTH_MESSAGE =
  'Google authorization could not be refreshed. Reconnect the Credential on the Credentials page to restore access.';

@Injectable()
export class ValidateDataStorageAccessService {
  private readonly logger = new Logger(ValidateDataStorageAccessService.name);

  constructor(
    private readonly dataStorageService: DataStorageService,
    private readonly dataStorageValidationFacade: DataStorageAccessValidatorFacade,
    private readonly dataStorageCredentialsResolver: DataStorageCredentialsResolver,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: ValidateDataStorageAccessCommand): Promise<ValidationResult> {
    const dataStorage = await this.dataStorageService.getByProjectIdAndId(
      command.projectId,
      command.id
    );

    if (command.userId) {
      const canUse = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        command.id,
        Action.USE,
        command.projectId
      );
      if (!canUse) {
        throw new ForbiddenException('You do not have access to this Storage');
      }
    }

    if (!dataStorage.config) {
      return ValidationResult.unconfigured('Complete setup to activate Storage');
    }

    if (await this.dataStorageCredentialsResolver.hasCredentials(dataStorage)) {
      try {
        const resolvedCredentials = await this.dataStorageCredentialsResolver.resolve(dataStorage);
        const result = await this.dataStorageValidationFacade.validateAccess(
          dataStorage.type,
          dataStorage.config,
          resolvedCredentials
        );
        if (!result.valid && result.code === ValidationResultCode.OAUTH_REAUTH_REQUIRED) {
          const lostGrant = await this.dataStorageCredentialsResolver.lostGrantFor(dataStorage);
          if (lostGrant) return ValidationResult.oauthReauthRequired(lostGrant.message);
        }
        return result;
      } catch (error) {
        this.logger.warn(
          `Failed to resolve credentials for storage ${dataStorage.id}: ${castError(error).message}`
        );
        if (error instanceof StorageCredentialUnavailableException && error.reauthRequired) {
          return ValidationResult.oauthReauthRequired(error.message);
        }
        if (error instanceof CredentialsExpiredException) {
          return ValidationResult.oauthReauthRequired(GOOGLE_OAUTH_REAUTH_MESSAGE);
        }
        return ValidationResult.failure(
          error instanceof Error ? error.message : 'Failed to resolve credentials'
        );
      }
    }

    return ValidationResult.unconfigured('Complete setup to activate Storage');
  }
}
