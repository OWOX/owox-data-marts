import { Injectable, ForbiddenException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { DataMartDefinitionValidatorFacade } from '../data-storage-types/facades/data-mart-definition-validator-facade.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartDefinitionSetEvent } from '../events/data-mart-definition-set.event';
import { DataMartDefinitionTypeChangedEvent } from '../events/data-mart-definition-type-changed.event';
import { DataMartDefinitionTypeSetEvent } from '../events/data-mart-definition-type-set.event';
import { DataMartMapper } from '../mappers/data-mart.mapper';
import { ConnectorSecretService } from '../services/connector/connector-secret.service';
import { DataMartService } from '../services/data-mart.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';

@Injectable()
export class UpdateDataMartDefinitionService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly mapper: DataMartMapper,
    private readonly connectorSecretService: ConnectorSecretService,
    private readonly legacyDataMartsService: LegacyDataMartsService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly definitionValidatorFacade: DataMartDefinitionValidatorFacade,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  @Transactional()
  async run(command: UpdateDataMartDefinitionCommand): Promise<DataMartDto> {
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

    const previousDefinitionType = dataMart.definitionType;
    const definitionTypeWasEmpty = !previousDefinitionType;
    const definitionWasEmpty = !dataMart.definition;
    let definitionTypeChanged = false;

    if (previousDefinitionType && previousDefinitionType !== command.definitionType) {
      this.assertDefinitionTypeChangeAllowed(previousDefinitionType, command.definitionType);
      definitionTypeChanged = true;
    }

    if (dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      if (command.definitionType !== DataMartDefinitionType.SQL) {
        throw new BusinessViolationException(
          'Only SQL definition type is supported for Legacy Google BigQuery data storages.'
        );
      }

      await this.legacyDataMartsService.updateQuery(
        dataMart.id,
        (command.definition as SqlDefinition).sqlQuery
      );
    }

    dataMart.definitionType = command.definitionType;

    if (command.definitionType === DataMartDefinitionType.CONNECTOR && command.definition) {
      const connectorDefinition = command.definition as ConnectorDefinition;
      let mergedDefinition: ConnectorDefinition;

      if (command.sourceDataMartId) {
        const sourceDataMart = await this.dataMartService.getByIdAndProjectId(
          command.sourceDataMartId,
          command.projectId
        );

        if (
          !sourceDataMart.definition ||
          sourceDataMart.definitionType !== DataMartDefinitionType.CONNECTOR
        ) {
          throw new BusinessViolationException(
            'Source Data Mart does not have a connector definition'
          );
        }

        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecretsFromSource(
          connectorDefinition,
          sourceDataMart.definition as ConnectorDefinition
        );

        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecrets(
          mergedDefinition,
          dataMart.definition as ConnectorDefinition | undefined
        );
      } else {
        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecrets(
          connectorDefinition,
          dataMart.definition as ConnectorDefinition | undefined
        );
      }

      // Store previous definition for orphaned secrets cleanup
      const previousDefinition = dataMart.definition as ConnectorDefinition | undefined;

      // Extract non-OAuth secrets and save them to a separate table
      dataMart.definition = await this.connectorSecretService.extractAndSaveSecrets(
        dataMart.id,
        command.projectId,
        connectorDefinition.connector.source.name,
        mergedDefinition
      );

      // Delete secrets for configuration items that were removed
      const currentConfigIds = new Set(
        (dataMart.definition as ConnectorDefinition).connector.source.configuration
          .map(item => (item as Record<string, unknown>)._id as string)
          .filter((id): id is string => !!id)
      );
      await this.connectorSecretService.deleteOrphanedSecrets(
        dataMart.id,
        currentConfigIds,
        previousDefinition
      );
    } else {
      dataMart.definition = command.definition;
    }

    // A type change repoints the Data Mart at a different kind of source, so the new definition is
    // checked against the storage before it lands. Same-type edits keep their existing behaviour:
    // they are validated on publish and on schema actualization, not on every save.
    // SQL is exempt for the same reason publishing exempts it — a SQL definition is dry-run from
    // the editor, and re-running it here would duplicate that round trip on every switch.
    if (definitionTypeChanged && command.definitionType !== DataMartDefinitionType.SQL) {
      await this.definitionValidatorFacade.checkIsValid(dataMart);
    }

    await this.dataMartService.save(dataMart);

    if (definitionTypeWasEmpty && dataMart.definitionType) {
      await this.eventDispatcher.publishExternal(
        new DataMartDefinitionTypeSetEvent(
          dataMart.id,
          command.projectId,
          dataMart.definitionType,
          dataMart.createdById
        )
      );
    }

    if (definitionWasEmpty && dataMart.definition) {
      await this.eventDispatcher.publishExternal(
        new DataMartDefinitionSetEvent(
          dataMart.id,
          command.projectId,
          dataMart.createdById,
          dataMart.definitionType
        )
      );
    }

    if (definitionTypeChanged && previousDefinitionType) {
      await this.eventDispatcher.publishExternal(
        new DataMartDefinitionTypeChangedEvent(
          dataMart.id,
          command.projectId,
          previousDefinitionType,
          dataMart.definitionType,
          dataMart.createdById
        )
      );
    }

    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_MART,
      dataMart.id,
      command.projectId
    );

    return this.mapper.toDomainDto(dataMart);
  }

  /**
   * A Data Mart may be repointed at another input source, keeping its id and therefore its
   * relationships, reports and field metadata. Connector-backed Data Marts are excluded in both
   * directions: a connector owns a write target, stored secrets, an incremental cursor and its own
   * run triggers, none of which can be handed over to (or picked up from) a plain source.
   */
  private assertDefinitionTypeChangeAllowed(
    currentType: DataMartDefinitionType,
    nextType: DataMartDefinitionType
  ): void {
    if (
      currentType === DataMartDefinitionType.CONNECTOR ||
      nextType === DataMartDefinitionType.CONNECTOR
    ) {
      throw new BusinessViolationException(
        'Input source type cannot be changed to or from a connector. Create a separate Data Mart instead.'
      );
    }
  }
}
