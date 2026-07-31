import { Injectable, ForbiddenException } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDto } from '../dto/domain/data-mart.dto';
import { UpdateDataMartDefinitionCommand } from '../dto/domain/update-data-mart-definition.command';
import { ConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { SqlDefinition } from '../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartDefinitionSetEvent } from '../events/data-mart-definition-set.event';
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
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  /**
   * Collects the Data Marts a save copies configurations from.
   *
   * Each copied item names its own source, so one save can draw on several.
   * `command.sourceDataMartId` covers items that name none, which is what
   * clients predating per-item sources send.
   */
  private collectSourceDataMartIds(
    definition: ConnectorDefinition,
    command: UpdateDataMartDefinitionCommand
  ): string[] {
    const sourceDataMartIds = new Set<string>();

    for (const item of definition.connector?.source?.configuration || []) {
      const copiedFrom = (item as Record<string, unknown>)._copiedFrom as
        | { dataMartId?: string; configId?: string }
        | undefined;

      if (!copiedFrom?.configId) {
        continue;
      }

      const sourceDataMartId = copiedFrom.dataMartId ?? command.sourceDataMartId;
      if (sourceDataMartId) {
        sourceDataMartIds.add(sourceDataMartId);
      }
    }

    // A source named by the request but by no item still has to be honoured:
    // older clients sent the id without marking up the items.
    if (sourceDataMartIds.size === 0 && command.sourceDataMartId) {
      sourceDataMartIds.add(command.sourceDataMartId);
    }

    return [...sourceDataMartIds];
  }

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

    const definitionTypeWasEmpty = !dataMart.definitionType;
    const definitionWasEmpty = !dataMart.definition;

    if (dataMart.definitionType && dataMart.definitionType !== command.definitionType) {
      throw new BusinessViolationException('DataMart already has definition');
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

      const sourceDataMartIds = this.collectSourceDataMartIds(connectorDefinition, command);

      if (sourceDataMartIds.length > 0) {
        const sourceDefinitions = new Map<string, ConnectorDefinition>();

        // Copying a configuration carries the source's stored credentials into
        // this Data Mart, so it takes permission on the source and not only on
        // the target being edited. Every source is checked before any of them is
        // read, so a save that is not fully permitted touches nothing.
        if (command.userId) {
          for (const sourceDataMartId of sourceDataMartIds) {
            const canCopyCredentials = await this.accessDecisionService.canAccess(
              command.userId,
              command.roles,
              EntityType.DATA_MART,
              sourceDataMartId,
              Action.COPY_CREDENTIALS,
              command.projectId
            );
            if (!canCopyCredentials) {
              throw new ForbiddenException(
                'You do not have permission to copy the configuration of this DataMart'
              );
            }
          }
        }

        for (const sourceDataMartId of sourceDataMartIds) {
          const sourceDataMart = await this.dataMartService.getByIdAndProjectId(
            sourceDataMartId,
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

          sourceDefinitions.set(sourceDataMartId, sourceDataMart.definition as ConnectorDefinition);
        }

        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecretsFromSource(
          connectorDefinition,
          sourceDefinitions,
          command.sourceDataMartId
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

      // Delete secrets this DataMart no longer references
      await this.connectorSecretService.deleteOrphanedSecrets(
        dataMart.id,
        dataMart.definition as ConnectorDefinition,
        previousDefinition
      );
    } else {
      dataMart.definition = command.definition;
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

    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_MART,
      dataMart.id,
      command.projectId
    );

    return this.mapper.toDomainDto(dataMart);
  }
}
