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
import { selectionOf } from '../connector-types/custom-connector-credential-fit';
import { SourceCredentialBindingService } from '../connector-types/source-credential-binding.service';
import {
  bindingIdKey,
  keyValuesOf,
  oldKeyIdsOf,
  withOldKeysOf,
  withoutKeyValues,
  withoutOldKeys,
  type SourceKeys,
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
      dataMart.definition = await this.saveConnectorDefinition(
        command,
        dataMart.id,
        command.definition as ConnectorDefinition,
        dataMart.definition as ConnectorDefinition | undefined
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

  /** The definition to store: key values go to old rows or stay with the selected Credentials. */
  private async saveConnectorDefinition(
    command: UpdateDataMartDefinitionCommand,
    dataMartId: string,
    incoming: ConnectorDefinition,
    previous: ConnectorDefinition | undefined
  ): Promise<ConnectorDefinition> {
    if (command.sourceDataMartId !== undefined || command.sourceConfigurationId !== undefined) {
      throw new BadRequestException(OUT_OF_DATE);
    }
    const { projectId } = command;
    const source = incoming.connector.source;
    const keys = await this.connectorService.resolveSourceKeys(
      projectId,
      source.name,
      source.version
    );
    // Compared without case, as MySQL resolves a connector's name.
    const previousName = previous?.connector?.source?.name;
    const switchedConnector =
      typeof previousName === 'string' && previousName.toLowerCase() !== source.name.toLowerCase();
    const previousItems = switchedConnector
      ? []
      : ((previous?.connector?.source?.configuration ?? []) as Config[]);
    rejectStaleConfiguration(source.configuration as Config[], previousItems, keys.fields);
    if (await this.connectorSecretService.hasTypedSecrets(projectId, incoming)) {
      throw new BadRequestException(OUT_OF_DATE);
    }

    const merged = await this.connectorSecretService.mergeDefinitionSecrets(
      projectId,
      incoming,
      previous
    );
    if (switchedConnector) await this.sourceCredentials.deactivateDataMart(dataMartId);
    const bound = await this.bindSourceCredentials(
      command,
      dataMartId,
      merged,
      previousItems,
      keys,
      previous?.connector?.source?.version !== source.version
    );
    const saved = await this.connectorSecretService.extractAndSaveSecrets(
      dataMartId,
      projectId,
      source.name,
      withConfiguration(
        merged,
        (merged.connector.source.configuration as Config[]).map(config => {
          const keepsOldKeys = bound.get(config._id as string);
          return keepsOldKeys === undefined
            ? config
            : storedBoundConfig(config, previousItems, keys.fields, keepsOldKeys);
        })
      )
    );
    await this.connectorSecretService.deleteOrphanedSecrets(dataMartId, saved, previous);
    return saved;
  }

  /** Binds new Credentials, re-checks kept ones, unbinds removed; true where a binding is kept. */
  private async bindSourceCredentials(
    command: UpdateDataMartDefinitionCommand,
    dataMartId: string,
    definition: ConnectorDefinition,
    previousItems: readonly Config[],
    keys: SourceKeys,
    versionChanged: boolean
  ): Promise<Map<string, boolean>> {
    const { projectId, userId, roles } = command;
    const { name: connectorName } = definition.connector.source;
    const configuration = definition.connector.source.configuration as Config[];
    const live = await this.sourceCredentials.boundCredentialIds(projectId, dataMartId);
    const bound = new Map<string, boolean>();
    for (const config of configuration) {
      const configId = config._id as string;
      const selected = config._credential_id as string | undefined;
      // A bound configuration keeps its id's spelling: MySQL would find the binding, SQLite would not.
      const respelled =
        typeof configId === 'string' &&
        [...live.keys()].some(
          key => key !== configId && bindingIdKey(key) === bindingIdKey(configId)
        );
      if (respelled) throw new BadRequestException(OUT_OF_DATE);
      const current = await this.sourceCredentials.lockBoundCredentialId(
        projectId,
        dataMartId,
        configId
      );
      if (selected === undefined) {
        // The page returns a live binding's Credential; a deleted one stays bound and runs say so.
        if (current && live.get(configId)) throw new BadRequestException(OUT_OF_DATE);
        if (!current) {
          // A new configuration needs a Credential; an existing one runs as it does today.
          if (keys.fields.length > 0 && !previousOf(config, previousItems)) {
            throw new BadRequestException(SELECT_CREDENTIAL);
          }
          continue;
        }
      } else if (selected !== current) {
        await this.sourceCredentials.checkConfigCredential({
          projectId,
          userId,
          roles,
          credentialId: selected,
          connectorName,
          config,
          model: keys.model,
        });
        await this.sourceCredentials.bindConfig(projectId, dataMartId, configId, selected);
      } else if (
        versionChanged ||
        !isDeepStrictEqual(
          fitChoice(config, keys.model),
          fitChoice(previousOf(config, previousItems), keys.model)
        )
      ) {
        await this.sourceCredentials.checkKeptConfigCredential({
          projectId,
          credentialId: selected,
          connectorName,
          config,
          model: keys.model,
        });
      }
      bound.set(configId, selected === undefined || selected === current);
    }
    // Every live binding, not only the stored items: an N-1 save may have dropped its configuration.
    const kept = new Set(configuration.map(config => config._id));
    for (const configId of live.keys()) {
      if (!kept.has(configId)) await this.sourceCredentials.unbindConfig(dataMartId, configId);
    }
    return bound;
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
const SELECT_CREDENTIAL = 'Select a Credential for each configuration.';

type Config = Record<string, unknown>;

/** Copy fields, a new old key reference or a typed key value come from a stale page. */
function rejectStaleConfiguration(
  configuration: readonly Config[],
  previousItems: readonly Config[],
  keyFields: SourceKeys['fields']
): void {
  // One _id is one binding; a repeated one would let its second item judge the first's rebind.
  const ids = configuration
    .map(config => config._id)
    .filter((id): id is string => typeof id === 'string' && id !== '')
    .map(bindingIdKey);
  if (new Set(ids).size !== ids.length) throw new BadRequestException(OUT_OF_DATE);
  for (const config of configuration) {
    const previous = previousOf(config, previousItems);
    const previousIds = oldKeyIdsOf(previous);
    const before = keyValuesOf(previous ?? {}, keyFields);
    const keyValues = Object.entries(keyValuesOf(config, keyFields));
    const selected = config._credential_id;
    if (
      '_copiedFrom' in config ||
      !oldKeyIdsOf(config).every(id => previousIds.includes(id)) ||
      (selected === undefined
        ? keyValues.some(
            ([at, value]) => value !== SECRET_MASK && !isDeepStrictEqual(value, before[at])
          )
        : keyValues.length > 0)
    ) {
      throw new BadRequestException(OUT_OF_DATE);
    }
    if (selected !== undefined && (typeof selected !== 'string' || !selected)) {
      throw new BadRequestException(SELECT_CREDENTIAL);
    }
  }
}

/** A bound configuration as stored: no Credential id or key values; old key refs only if kept. */
function storedBoundConfig(
  config: Config,
  previousItems: readonly Config[],
  keyFields: SourceKeys['fields'],
  keepsOldKeys: boolean
): Config {
  const { _credential_id: _selected, ...rest } = config;
  const stored = withoutKeyValues(rest, keyFields);
  // A rebound configuration must not lead a run to the old row of another sign-in.
  return keepsOldKeys
    ? withOldKeysOf(stored, previousOf(config, previousItems))
    : withoutOldKeys(stored);
}

/** What a Credential must fit besides the version: a custom connector's branch, else the auth variant. */
function fitChoice(config: Config | undefined, model: SourceKeys['model']): unknown {
  if (!config) return undefined;
  if (model) return selectionOf(model, config);
  const { AuthType: variant } = config;
  return typeof variant === 'object' && variant !== null ? Object.keys(variant) : undefined;
}

function previousOf(config: Config, previousItems: readonly Config[]): Config | undefined {
  const id = config._id;
  if (typeof id !== 'string' || !id) return undefined;
  const exact = previousItems.find(item => item._id === id);
  if (exact) return exact;
  // Items stored before ids were compared folded may hold twins; then none is this one's.
  const folded = previousItems.filter(
    item => typeof item._id === 'string' && bindingIdKey(item._id) === bindingIdKey(id)
  );
  return folded.length === 1 ? folded[0] : undefined;
}

function withConfiguration(
  definition: ConnectorDefinition,
  configuration: Config[]
): ConnectorDefinition {
  return {
    ...definition,
    connector: {
      ...definition.connector,
      source: { ...definition.connector.source, configuration },
    },
  };
}
