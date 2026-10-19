import { ConflictException } from '@nestjs/common';
import { DataMart } from '../entities/data-mart.entity';
import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, ForbiddenException } from '@nestjs/common';
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
import { ConnectorService } from '../services/connector/connector.service';
import type { ConnectorCapabilities } from '../connector-types/connector-capabilities';

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
    private readonly connectorService: ConnectorService,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  async run(command: UpdateDataMartDefinitionCommand): Promise<DataMartDto> {
    const before = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);
    if (
      command.userId &&
      !(await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      ))
    )
      throw new ForbiddenException('You do not have permission to edit this DataMart');
    if (
      command.userId &&
      !(await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.STORAGE,
        before.storage.id,
        Action.USE,
        command.projectId
      ))
    )
      throw new ForbiddenException('Storage USE permission is required');
    if (command.expectedRevision !== undefined && command.expectedRevision !== before.revision)
      throw new ConflictException('Data Mart configuration changed');
    if (before.definitionType && before.definitionType !== command.definitionType)
      this.assertDefinitionTypeChangeAllowed(before.definitionType, command.definitionType);
    const previousDefinitionType = before.definitionType;
    const definitionTypeWasEmpty = !previousDefinitionType;
    const definitionWasEmpty = !before.definition;
    const definitionTypeChanged =
      !!previousDefinitionType && previousDefinitionType !== command.definitionType;
    const candidate = Object.assign(new DataMart(), before, {
      definitionType: command.definitionType,
      definition: command.definition,
    });
    if (
      before.status === 'PUBLISHED' ||
      (before.definitionType && before.definitionType !== command.definitionType)
    )
      await this.definitionValidatorFacade.checkIsValid(candidate);
    const result = await this.persist(command, before.revision);
    const dataMart = Object.assign({}, before, {
      definitionType: command.definitionType,
      definition: command.definition,
    });
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

    if (before.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY)
      await this.legacyDataMartsService.updateQuery(
        before.id,
        (command.definition as SqlDefinition).sqlQuery
      );
    return result;
  }

  @Transactional()
  private async persist(
    command: UpdateDataMartDefinitionCommand,
    validatedRevision: number
  ): Promise<DataMartDto> {
    await this.dataMartService.lockConfigurationReferences(command.projectId);
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);
    if (dataMart.revision !== validatedRevision)
      throw new ConflictException('Data Mart configuration changed during validation');
    if (command.expectedRevision !== undefined && command.expectedRevision !== dataMart.revision)
      throw new ConflictException('Data Mart configuration changed');

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

    if (previousDefinitionType && previousDefinitionType !== command.definitionType) {
      this.assertDefinitionTypeChangeAllowed(previousDefinitionType, command.definitionType);
    }

    const connectorCapabilities = await this.resolveConnectorCapabilities(command);
    this.validateConnectorConfigurationCount(command, connectorCapabilities);

    if (dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY) {
      if (command.definitionType !== DataMartDefinitionType.SQL) {
        throw new BusinessViolationException(
          'Only SQL definition type is supported for Legacy Google BigQuery data storages.'
        );
      }
    }

    dataMart.definitionType = command.definitionType;

    if (command.definitionType === DataMartDefinitionType.CONNECTOR && command.definition) {
      const connectorDefinition = command.definition as ConnectorDefinition;
      const previousDefinition = dataMart.definition as ConnectorDefinition | undefined;
      let sourceDefinition: ConnectorDefinition | undefined;
      let mergedDefinition: ConnectorDefinition;

      if (command.sourceDataMartId) {
        await this.validateCredentialCopyAccess(command);

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

        sourceDefinition = sourceDataMart.definition as ConnectorDefinition;
      }

      this.validateSecretReferences(connectorDefinition, previousDefinition, sourceDefinition);

      if (sourceDefinition) {
        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecretsFromSource(
          command.projectId,
          connectorDefinition,
          sourceDefinition
        );
        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecrets(
          command.projectId,
          mergedDefinition,
          previousDefinition
        );
      } else {
        mergedDefinition = await this.connectorSecretService.mergeDefinitionSecrets(
          command.projectId,
          connectorDefinition,
          previousDefinition
        );
      }

      // Store previous definition for orphaned secrets cleanup
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

    if (command.definitionType === DataMartDefinitionType.CONNECTOR && command.userId) {
      dataMart.connectorPreparationId = randomUUID();
      dataMart.connectorPreparedById = command.userId;
      dataMart.connectorPreparedRevision = dataMart.revision + 1;
    }
    await this.dataMartService.save(dataMart);

    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_MART,
      dataMart.id,
      command.projectId
    );

    return this.mapper.toDomainDto(dataMart);
  }

  /**
   * A Data Mart may name a custom (DB-stored) connector, which is never in the build-time
   * bundle, so this resolves through the custom-aware resolver: the bundled-only lookup
   * 404s on every custom connector.
   */
  private async resolveConnectorCapabilities(
    command: UpdateDataMartDefinitionCommand
  ): Promise<ConnectorCapabilities | undefined> {
    if (command.definitionType !== DataMartDefinitionType.CONNECTOR) {
      return undefined;
    }

    const definition = command.definition as ConnectorDefinition;
    const source = definition?.connector?.source;
    return source?.name
      ? this.connectorService.resolveConnectorCapabilities(
          command.projectId,
          source.name,
          source.version
        )
      : undefined;
  }

  private validateConnectorConfigurationCount(
    command: UpdateDataMartDefinitionCommand,
    capabilities: ConnectorCapabilities | undefined
  ): void {
    if (!capabilities?.singleConfiguration) {
      return;
    }

    const definition = command.definition as ConnectorDefinition;
    const source = definition?.connector?.source;
    if (source?.configuration?.length !== 1) {
      throw new BadRequestException(
        `Connector '${source?.name}' requires exactly one source configuration`
      );
    }
  }

  private async validateCredentialCopyAccess(
    command: UpdateDataMartDefinitionCommand
  ): Promise<void> {
    if (!command.userId || !command.sourceDataMartId) {
      return;
    }

    const canCopyCredentials = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      command.sourceDataMartId,
      Action.EDIT,
      command.projectId
    );
    if (!canCopyCredentials) {
      throw new ForbiddenException(
        'You do not have permission to copy connector credentials from the source Data Mart. ' +
          'Ask its owner to add you as a Data Owner or to turn on "Shared for maintenance", ' +
          'or enter the credentials manually.'
      );
    }
  }

  private validateSecretReferences(
    incoming: ConnectorDefinition,
    previous: ConnectorDefinition | undefined,
    copySource: ConnectorDefinition | undefined
  ): void {
    const previousConfigurations = previous?.connector?.source?.configuration ?? [];
    const sourceConfigurations = copySource?.connector?.source?.configuration ?? [];

    for (const configuration of incoming.connector.source.configuration) {
      const item = configuration as Record<string, unknown>;
      const secretsId = typeof item._secrets_id === 'string' ? item._secrets_id : undefined;
      if (!secretsId) {
        continue;
      }

      const matchesPrevious = previousConfigurations.some(previousConfiguration => {
        const previousItem = previousConfiguration as Record<string, unknown>;
        return previousItem._id === item._id && previousItem._secrets_id === secretsId;
      });
      const copiedFrom =
        item._copiedFrom && typeof item._copiedFrom === 'object'
          ? (item._copiedFrom as Record<string, unknown>)
          : undefined;
      const matchesCopySource =
        typeof copiedFrom?.configId === 'string' &&
        sourceConfigurations.some(sourceConfiguration => {
          const sourceItem = sourceConfiguration as Record<string, unknown>;
          return sourceItem._id === copiedFrom.configId && sourceItem._secrets_id === secretsId;
        });

      if (!matchesPrevious && !matchesCopySource) {
        throw new ForbiddenException(
          'The selected connector credentials cannot be used for this DataMart'
        );
      }
    }
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
