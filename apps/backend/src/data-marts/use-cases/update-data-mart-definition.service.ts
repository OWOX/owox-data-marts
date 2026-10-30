import { BadRequestException, Injectable, ForbiddenException } from '@nestjs/common';
import { isDeepStrictEqual } from 'util';
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
import {
  ConnectorSecretService,
  SECRET_MASK,
} from '../services/connector/connector-secret.service';
import { DataMartService } from '../services/data-mart.service';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';
import { ConnectorService } from '../services/connector/connector.service';
import type { ConnectorCapabilities } from '../connector-types/connector-capabilities';
import { DataMartSqlReferenceValidator } from '../services/data-mart-sql-reference-validator.service';
import { SourceCredentialBindingService } from '../connector-types/source-credential-binding.service';
import {
  bindingIdKey,
  keyValuesOf,
  oldKeyIdsOf,
  withOldKeysOf,
  withoutKeyValues,
  withoutOldKeys,
  type SourceKeyFields,
} from '../connector-types/source-key-fields';

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
    private readonly sqlReferenceValidator: DataMartSqlReferenceValidator,
    private readonly sourceCredentials: SourceCredentialBindingService,
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

    // Data Mart references in SQL are checked before anything is written or sent to a legacy
    // storage; the query is saved with every reference's title refreshed.
    const sqlQuery =
      command.definitionType === DataMartDefinitionType.SQL && command.definition
        ? await this.sqlReferenceValidator.prepareForSave({
            dataMart,
            sqlQuery: (command.definition as SqlDefinition).sqlQuery,
            userId: command.userId || undefined,
            roles: command.roles,
          })
        : undefined;

    const previousDefinitionType = dataMart.definitionType;
    const definitionTypeWasEmpty = !previousDefinitionType;
    const definitionWasEmpty = !dataMart.definition;
    let definitionTypeChanged = false;

    if (previousDefinitionType && previousDefinitionType !== command.definitionType) {
      this.assertDefinitionTypeChangeAllowed(previousDefinitionType, command.definitionType);
      definitionTypeChanged = true;
    }

    const connectorCapabilities = await this.resolveConnectorCapabilities(command);
    this.validateConnectorConfigurationCount(command, connectorCapabilities);

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

      const bindings = await this.checkSourceBindings(
        command,
        connectorDefinition,
        previousDefinition
      );
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
        withStoredBoundConfigs(mergedDefinition, bindings)
      );

      // Delete secrets this DataMart no longer references
      await this.connectorSecretService.deleteOrphanedSecrets(
        dataMart.id,
        dataMart.definition as ConnectorDefinition,
        previousDefinition
      );
      await this.releaseSourceBindings(
        dataMart.id,
        bindings,
        dataMart.definition as ConnectorDefinition
      );
    } else if (sqlQuery !== undefined) {
      dataMart.definition = { ...(command.definition as SqlDefinition), sqlQuery };
    } else {
      dataMart.definition = command.definition;
    }

    // A type change repoints the Data Mart at a different kind of source, so the new definition is
    // checked against the storage before it lands. Same-type edits keep their existing behaviour:
    // they are validated on publish and on schema actualization, not on every save.
    //
    // SQL targets are checked here too. The editor's dry run is advisory — its result does not
    // gate Save, and API callers never run it at all — so exempting SQL would let an invalid
    // query silently replace a working table definition.
    if (definitionTypeChanged) {
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

  /**
   * This release never binds, but keeps every binding a newer one made: a bound configuration takes
   * no key values, other Credential, copy or other old key row. Unbound ones save as before.
   */
  private async checkSourceBindings(
    command: UpdateDataMartDefinitionCommand,
    incoming: ConnectorDefinition,
    previous: ConnectorDefinition | undefined
  ): Promise<SourceBindingsOfSave> {
    const { projectId } = command;
    const source = incoming.connector.source;
    const configuration = source.configuration as Config[];
    // Compared without case, as MySQL resolves a connector's name.
    const previousName = previous?.connector?.source?.name;
    const switchedConnector =
      typeof previousName === 'string' && previousName.toLowerCase() !== source.name.toLowerCase();
    // A switched connector's bindings are all deactivated after the save, so none is kept.
    const live: ReadonlyMap<string, string | null> = switchedConnector
      ? new Map()
      : await this.sourceCredentials.boundCredentialIds(projectId, command.id);

    const copiedIds = configuration
      .map(config => (config._copiedFrom as Config | null | undefined)?.configId)
      .filter((id): id is string => typeof id === 'string');
    if (command.sourceDataMartId && copiedIds.length > 0) {
      const sourceLive = await this.sourceCredentials.boundCredentialIds(
        projectId,
        command.sourceDataMartId
      );
      const boundInSource = new Set([...sourceLive.keys()].map(bindingIdKey));
      if (copiedIds.some(id => boundInSource.has(bindingIdKey(id)))) {
        throw new BadRequestException(OUT_OF_DATE);
      }
    }

    const previousItems = (previous?.connector?.source?.configuration ?? []) as Config[];
    const kept = new Map<string, Config | undefined>();
    let fields: readonly SourceKeyFields[] | undefined;
    for (const config of configuration) {
      const id = typeof config._id === 'string' && config._id ? config._id : undefined;
      const bound = id !== undefined && live.has(id);
      const selected = config._credential_id;
      if (selected !== undefined && (!bound || selected !== live.get(id))) {
        throw new BadRequestException(OUT_OF_DATE);
      }
      if (!bound) {
        // A respelled id would lose its binding where ids are compared exactly, as in SQLite.
        if (id && [...live.keys()].some(key => bindingIdKey(key) === bindingIdKey(id))) {
          throw new BadRequestException(OUT_OF_DATE);
        }
        continue;
      }
      fields ??= (
        await this.connectorService.resolveSourceKeys(projectId, source.name, source.version)
      ).fields;
      const previousItem = previousItems.find(item => item._id === id);
      if (isStaleBoundConfig(config, previousItem, fields)) {
        throw new BadRequestException(OUT_OF_DATE);
      }
      kept.set(id, previousItem);
    }
    return { live, kept, fields: fields ?? [], switchedConnector };
  }

  /** Deactivates the bindings of configurations the saved definition no longer has. */
  private async releaseSourceBindings(
    dataMartId: string,
    { live, switchedConnector }: SourceBindingsOfSave,
    saved: ConnectorDefinition
  ): Promise<void> {
    if (switchedConnector) {
      await this.sourceCredentials.deactivateDataMart(dataMartId);
      return;
    }
    if (live.size === 0) return;
    const savedIds = new Set(saved.connector.source.configuration.map(config => config._id));
    for (const configId of live.keys()) {
      if (!savedIds.has(configId)) await this.sourceCredentials.unbindConfig(dataMartId, configId);
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

const OUT_OF_DATE = 'This page is out of date. Reload it.';

type Config = Record<string, unknown>;

interface SourceBindingsOfSave {
  readonly live: ReadonlyMap<string, string | null>;
  /** Each bound configuration the save keeps, with its stored item. */
  readonly kept: ReadonlyMap<string, Config | undefined>;
  readonly fields: readonly SourceKeyFields[];
  readonly switchedConnector: boolean;
}

/** A copy, an old key row it did not hold or a typed key value comes from a stale page. */
function isStaleBoundConfig(
  config: Config,
  previous: Config | undefined,
  fields: readonly SourceKeyFields[]
): boolean {
  const held = oldKeyIdsOf(previous);
  const before = keyValuesOf(previous ?? {}, fields);
  return (
    '_copiedFrom' in config ||
    !oldKeyIdsOf(config).every(id => held.includes(id)) ||
    Object.entries(keyValuesOf(config, fields)).some(
      ([at, value]) => value !== SECRET_MASK && !isDeepStrictEqual(value, before[at])
    )
  );
}

/** Bound configurations as stored: no Credential id or key values, and the old key refs they held. */
function withStoredBoundConfigs(
  definition: ConnectorDefinition,
  { kept, fields }: SourceBindingsOfSave
): ConnectorDefinition {
  if (kept.size === 0) return definition;
  const configuration = (definition.connector.source.configuration as Config[]).map(config => {
    const id = config._id as string;
    if (!kept.has(id)) return config;
    const { _credential_id: _selected, ...rest } = config;
    return withOldKeysOf(withoutOldKeys(withoutKeyValues(rest, fields)), kept.get(id));
  });
  return {
    ...definition,
    connector: {
      ...definition.connector,
      source: { ...definition.connector.source, configuration },
    },
  };
}
