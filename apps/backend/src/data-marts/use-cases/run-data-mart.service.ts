import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { DataMartService } from '../services/data-mart.service';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';
import { RunDataMartCommand } from '../dto/domain/run-data-mart.command';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorageAccessValidatorFacade } from '../data-storage-types/facades/data-storage-access-validator-facade.service';
import { DataStorageCredentialsResolver } from '../data-storage-types/data-storage-credentials-resolver.service';
import { ValidationResultCode } from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { CredentialsExpiredException } from '../exceptions/google-oauth.exceptions';
import { isBigQueryOAuthCredentials } from '../data-storage-types/data-storage-credentials.guards';

@Injectable()
export class RunDataMartService {
  private readonly logger = new Logger(RunDataMartService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly connectorExecutionService: ConnectorExecutionService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly validationFacade: DataStorageAccessValidatorFacade,
    private readonly credentialsResolver: DataStorageCredentialsResolver
  ) {}

  async run(command: RunDataMartCommand): Promise<string> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    // Access check only for user-initiated runs (manual run from UI).
    // Scheduled runs have roles=[] — no user context, access was checked at trigger creation.
    if (command.createdById && command.roles.length > 0) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.createdById,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to run this DataMart');
      }
    }

    if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR) {
      throw new Error('Only data marts with connector definition type can be run manually');
    }

    // Pre-check is for user-initiated runs only, where it surfaces an immediate, clear error.
    // Scheduled runs deliberately skip it so they still create a run record and fail during
    // execution — preserving the visible failed-run history and notifications operators rely on.
    if (command.runType === RunType.manual) {
      await this.checkStorageAccess(dataMart);
    }

    return await this.connectorExecutionService.run(
      dataMart,
      command.createdById,
      command.runType,
      command.payload
    );
  }

  /**
   * Pre-run guard that surfaces an expired Google OAuth authorization before a run is
   * created, so the user gets a clear "Reconnect Storage" error instead of a run that
   * fails mid-execution with an opaque 401.
   *
   * Runs outside any DB transaction (resolving credentials may refresh and persist tokens).
   * Only a definitive re-authorization condition blocks the run — transient problems
   * (network blips, rate limits, temporary API/token-endpoint failures) must not prevent a
   * run from starting, since those are surfaced during execution as they were before.
   */
  private async checkStorageAccess(dataMart: DataMart): Promise<void> {
    const { storage } = dataMart;

    if (!storage.config || !storage.credentialId) {
      return;
    }

    try {
      const credentials = await this.credentialsResolver.resolve(storage);
      if (!isBigQueryOAuthCredentials(credentials)) return;
      const result = await this.validationFacade.validateAccess(
        storage.type,
        storage.config,
        credentials
      );

      if (!result.valid && result.code === ValidationResultCode.OAUTH_REAUTH_REQUIRED) {
        throw new CredentialsExpiredException(storage.id, 'storage');
      }
    } catch (error) {
      if (error instanceof CredentialsExpiredException) {
        throw error;
      }
      this.logger.warn(
        `Pre-run storage access check did not complete for storage ${storage.id}; proceeding with run`,
        error
      );
    }
  }
}
