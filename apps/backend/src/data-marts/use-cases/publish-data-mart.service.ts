import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { DataMartPublishedEvent } from '../events/data-mart-published.event';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { DataMartService } from '../services/data-mart.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { RunType } from '../../common/scheduler/shared/types';
import { ConnectorExecutionService } from '../services/connector/connector-execution.service';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';

/**
 * Failure reasons authored here, and therefore safe to show to end users.
 *
 * Anything else raised while publishing — storage driver errors, warehouse
 * dry-run validation output — may carry SQL, table paths or credential hints,
 * so callers that surface failures to the UI must not echo it back. See
 * PublishDataStorageDraftsService.toUserFacingReason.
 */
export const PUBLISH_DATA_MART_ERRORS = {
  NO_PERMISSION: 'You do not have permission to publish this Data Mart',
  ALREADY_PUBLISHED: 'Data Mart is already published',
  NO_DEFINITION: 'Data Mart has no definition',
} as const;

@Injectable()
export class PublishDataMartService {
  private readonly logger = new Logger(PublishDataMartService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly mapper: DataMartMapper,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly connectorExecutionService: ConnectorExecutionService,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  async run(command: PublishDataMartCommand): Promise<DataMartDto> {
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
        throw new ForbiddenException(PUBLISH_DATA_MART_ERRORS.NO_PERMISSION);
      }
    }

    if (dataMart.status !== DataMartStatus.DRAFT) {
      throw new BusinessViolationException(PUBLISH_DATA_MART_ERRORS.ALREADY_PUBLISHED);
    }

    if (!dataMart.definition || !dataMart.definitionType) {
      throw new BusinessViolationException(PUBLISH_DATA_MART_ERRORS.NO_DEFINITION);
    }

    if (dataMart.definitionType !== DataMartDefinitionType.SQL) {
      await this.definitionValidatorFacade.checkIsValid(dataMart);
    }

    const previousStatus = dataMart.status;
    dataMart.status = DataMartStatus.PUBLISHED;

    await this.dataMartService.save(dataMart);

    await this.runPostPublishEffect(dataMart.id, 'scheduling the search reindex', async () => {
      await this.advancedSearchIndexSync?.scheduleReindex(
        SearchableEntityType.DATA_MART,
        dataMart.id,
        command.projectId
      );
    });

    const event = new DataMartPublishedEvent(
      dataMart.id,
      command.projectId,
      dataMart.createdById,
      previousStatus
    );

    await this.runPostPublishEffect(dataMart.id, 'dispatching DataMartPublishedEvent', async () => {
      await this.eventDispatcher.publish(event);
    });

    if (dataMart.definitionType === DataMartDefinitionType.CONNECTOR) {
      const userId = command.createdById ?? command.userId;

      this.connectorExecutionService
        .run(dataMart, userId, RunType.manual, {
          runType: 'INCREMENTAL',
        })
        .catch(error => {
          this.logger.error(
            `Failed to auto-run connector after publishing data mart ${dataMart.id}`,
            error?.stack,
            {
              dataMartId: dataMart.id,
              projectId: dataMart.projectId,
              userId,
            }
          );
        });
    }

    return this.mapper.toDomainDto(dataMart);
  }

  /**
   * Runs a side effect that must not fail the publish.
   *
   * By the time these run the Data Mart is already saved as PUBLISHED, so a
   * rejection would make callers report a failure for a Data Mart that is in
   * fact published — the bulk publisher would count it as failed and send the
   * user to a DRAFT-filtered list it no longer appears in, and the single-mart
   * endpoint would answer 500. The connector auto-run below is already
   * fire-and-forget for the same reason.
   */
  private async runPostPublishEffect(
    dataMartId: string,
    description: string,
    effect: () => Promise<void>
  ): Promise<void> {
    try {
      await effect();
    } catch (error) {
      this.logger.error(
        `Published data mart ${dataMartId} but ${description} failed`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }
}
