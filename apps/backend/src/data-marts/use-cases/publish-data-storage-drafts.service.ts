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
import { PublishDataMartService } from './publish-data-mart.service';
import { ValidateDataStorageAccessService } from './validate-data-storage-access.service';

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

    // The trigger is processed asynchronously with no live request/JWT, so the
    // publisher's roles (needed for the per-draft EDIT check) must be resolved
    // fresh here rather than reused from trigger-creation time.
    const roles = command.userId
      ? ((await this.idpProjectionsFacade.getProjectForUser(command.userId, command.projectId))
          .roles ?? [])
      : [];

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
        await this.schemaActualizeTriggerService.createTrigger(
          command.userId,
          command.projectId,
          draft.id
        );
        ++successCount;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to publish draft ${draft.id}: ` +
            (error instanceof Error ? (error.stack ?? error.message) : String(error))
        );
        failures.push(new PublishDraftFailureDto(draft.id, draft.title, message));
        ++failedCount;
      }
    }

    return new PublishDataStorageDraftsResultDto(successCount, failedCount, failures);
  }
}
