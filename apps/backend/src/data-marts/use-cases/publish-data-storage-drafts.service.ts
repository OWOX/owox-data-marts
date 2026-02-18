import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { PublishDataStorageDraftsResultDto } from '../dto/domain/publish-data-storage-drafts-result.dto';
import { PublishDataStorageDraftsCommand } from '../dto/domain/publish-data-storage-drafts.command';
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
    private readonly validateDataStorageAccessService: ValidateDataStorageAccessService
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

    const draftIds = await this.dataMartService.findDraftIdsByStorage(dataStorage);

    let successCount = 0;
    let failedCount = 0;

    for (const draftId of draftIds) {
      try {
        await this.publishDataMartService.run(
          new PublishDataMartCommand(draftId, command.projectId)
        );
        await this.schemaActualizeTriggerService.createTrigger(
          command.userId,
          command.projectId,
          draftId
        );
        ++successCount;
      } catch {
        ++failedCount;
      }
    }

    return new PublishDataStorageDraftsResultDto(successCount, failedCount);
  }
}
