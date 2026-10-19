import type { ConnectorSpecification } from '../connector-types/connector-specification';
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { StorageResourceBrowserFacade } from '../data-storage-types/facades/storage-resource-browser.facade';

import { ConnectorDefinitionVersionStatus } from '../entities/connector-definition-version.entity';
import { McpSetupDiscoveryMapper } from '../mappers/mcp-setup-discovery.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import { ConnectorService } from '../services/connector/connector.service';
import { DataStorageService } from '../services/data-storage.service';

import type {
  McpSetupDiscoveryFacade,
  SetupConnectorDto,
  SetupConnectorRequest,
  SetupDiscoveryActor,
  SetupRequirementsRequest,
  SetupResourcesRequest,
  SetupStorageRequest,
  SetupStorageDto,
} from '../facades/mcp-setup-discovery.facade';

@Injectable()
export class SetupDiscoveryService implements McpSetupDiscoveryFacade {
  constructor(
    private readonly storages: DataStorageService,
    private readonly access: AccessDecisionService,
    private readonly browser: StorageResourceBrowserFacade,
    private readonly connectors: ConnectorService,
    private readonly definitions: ConnectorDefinitionService,
    private readonly publicOrigin: PublicOriginService,
    private readonly mapper: McpSetupDiscoveryMapper
  ) {}

  async listStorages(request: SetupStorageRequest) {
    this.validatePage(request);
    const candidates = await this.storages.listSetupMetadata(request.projectId);
    const storages: SetupStorageDto[] = [];
    const offset = request.offset ?? 0;
    for (const storage of candidates) {
      if (
        !(await this.access.canAccessStored(
          request.userId,
          request.roles,
          EntityType.STORAGE,
          storage.id,
          Action.SEE,
          request.projectId
        ))
      )
        continue;
      const availableForUse = await this.access.canAccessStored(
        request.userId,
        request.roles,
        EntityType.STORAGE,
        storage.id,
        Action.USE,
        request.projectId
      );
      const availableForMaintenance = await this.access.canAccessStored(
        request.userId,
        request.roles,
        EntityType.STORAGE,
        storage.id,
        Action.EDIT,
        request.projectId
      );
      storages.push(
        this.mapper.toStorage({
          id: storage.id,
          title: storage.title,
          type: storage.type,
          availableForUse,
          availableForMaintenance,
        })
      );
      if (storages.length > offset + request.limit) break;
    }
    return {
      items: storages.slice(offset, offset + request.limit),
      hasMore: storages.length > offset + request.limit,
    };
  }

  async listStorageResources(request: SetupResourcesRequest) {
    this.validatePage(request);
    const storage = await this.requireUsableStorage(request, request.storageId);
    if (storage.type !== DataStorageType.GOOGLE_BIGQUERY)
      throw new BadRequestException('Resource browsing is not supported for this storage type');
    if (
      request.level === 'resources' &&
      (!request.namespaceId || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,254}$/.test(request.namespaceId))
    )
      throw new BadRequestException('A valid namespaceId is required');
    // Keep stored lookup/authorization outside the provider error boundary.
    try {
      const resources =
        request.level === 'namespaces'
          ? await this.browser.listNamespaces(storage, { strict: true })
          : await this.browser.listLeafResources(
              storage,
              request.namespaceId!,
              request.resourceType,
              { strict: true }
            );
      const offset = request.offset ?? 0;
      return {
        source: 'live' as const,
        items: resources
          .slice(offset, offset + request.limit)
          .map(resource => this.mapper.toResource(resource)),
        hasMore: resources.length > offset + request.limit,
      };
    } catch (error) {
      const code =
        error instanceof HttpException
          ? error.getStatus()
          : error && typeof error === 'object'
            ? ((error as { status?: unknown }).status ?? (error as { code?: unknown }).code)
            : undefined;
      if (code === 401 || code === '401')
        throw new UnauthorizedException(
          'Storage credentials are invalid or expired. Reauthorize the storage in the app.'
        );
      if (code === 403 || code === '403')
        throw new ForbiddenException('Storage credentials cannot list these resources');
      throw new BadGatewayException(
        'Storage discovery failed. Check the storage connection in the app.'
      );
    }
  }

  async listConnectors(request: SetupConnectorRequest) {
    this.validatePage(request);
    await this.requireConnectorStorage(request);
    const bundled = await this.connectors.getAvailableConnectors();
    const custom = await this.definitions.listByProject(request.projectId);
    const active = await this.definitions.getActiveVersionNumbersByDefId(custom);
    const candidates = [
      ...bundled.map(connector => ({
        name: connector.name,
        title: connector.title,
        kind: 'built-in' as const,
        activeVersion: null,
        publishedVersions: [],
        versionsTruncated: false,
      })),
      ...custom
        .filter(
          definition =>
            active.has(definition.id) &&
            !bundled.some(connector => connector.name === definition.name)
        )
        .map(definition => ({
          name: definition.name,
          title: definition.title,
          kind: 'custom' as const,
          activeVersion: active.get(definition.id)!,
          publishedVersions: [],
          versionsTruncated: false,
          definitionId: definition.id,
        })),
    ];
    const offset = request.offset ?? 0;
    const items: SetupConnectorDto[] = [];
    for (const candidate of candidates.slice(offset, offset + request.limit)) {
      const { name, title, kind, activeVersion } = candidate;
      const versions =
        'definitionId' in candidate
          ? (await this.definitions.listVersions(request.projectId, candidate.definitionId))
              .filter(version => version.status === ConnectorDefinitionVersionStatus.PUBLISHED)
              .map(version => version.version)
          : [];
      if (kind === 'custom' && !versions.includes(activeVersion!)) continue;
      items.push({
        name,
        title,
        kind,
        activeVersion,
        publishedVersions: versions.slice(0, 100),
        versionsTruncated: versions.length > 100,
      });
    }
    return { items, hasMore: candidates.length > offset + request.limit };
  }

  async getConnectorRequirements(request: SetupRequirementsRequest) {
    await this.requireConnectorStorage(request);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,254}$/.test(request.connectorName))
      throw new BadRequestException('Invalid connector name');
    if (
      request.version !== undefined &&
      (!Number.isSafeInteger(request.version) || request.version < 1)
    )
      throw new BadRequestException('Invalid connector version');
    const bundled = (await this.connectors.getAvailableConnectors()).find(
      connector => connector.name === request.connectorName
    );
    let connector: SetupConnectorDto;
    if (bundled) {
      if (request.version !== undefined)
        throw new BadRequestException('Built-in connectors do not support version pinning');
      connector = {
        name: bundled.name,
        title: bundled.title,
        kind: 'built-in',
        activeVersion: null,
        publishedVersions: [],
        versionsTruncated: false,
      };
    } else {
      const custom = (await this.definitions.listByProject(request.projectId)).find(
        definition => definition.name === request.connectorName
      );
      if (!custom) throw new NotFoundException('Connector not found');
      const active = await this.definitions.getActiveVersionNumberForDef(custom);
      const versions = (await this.definitions.listVersions(request.projectId, custom.id))
        .filter(version => version.status === ConnectorDefinitionVersionStatus.PUBLISHED)
        .map(version => version.version);
      if (request.version === undefined ? active === null : !versions.includes(request.version))
        throw new NotFoundException('Published connector version not found');
      connector = {
        name: custom.name,
        title: custom.title,
        kind: 'custom',
        activeVersion: active,
        publishedVersions: versions.slice(0, 100),
        versionsTruncated: versions.length > 100,
      };
    }
    let specification: ConnectorSpecification;
    try {
      specification = await this.connectors.resolveConnectorSpecification(
        request.projectId,
        request.connectorName,
        request.version
      );
    } catch (error) {
      // Manifest parser diagnostics can include author-written credential literals.
      if (error instanceof BadRequestException)
        throw new BadRequestException(
          'Connector requirements are invalid. Review the connector in the app.'
        );
      throw error;
    }
    const requirements = this.mapper.toRequirements(specification);
    if (requirements.parameters.length + requirements.authorization.length > 500)
      throw new BadRequestException('Connector requirements exceed the supported size');
    const capabilities = await this.connectors.resolveConnectorCapabilities(
      request.projectId,
      request.connectorName,
      request.version
    );
    return {
      connector,
      ...requirements,
      capabilities: {
        singleConfiguration: capabilities.singleConfiguration,
        copySecretsByValue: capabilities.copySecretsByValue,
      },
      limits: {
        minimumConfigurations: 1,
        maximumConfigurations: capabilities.singleConfiguration ? 1 : null,
        minimumFields: 1,
      },
      credentialState: 'not_checked' as const,
      appUrl: new URL(
        `/ui/${encodeURIComponent(request.projectId)}/data-marts`,
        this.publicOrigin.getPublicOrigin()
      ).toString(),
    };
  }

  private async requireUsableStorage(actor: SetupDiscoveryActor, storageId: string) {
    const storage = await this.storages.getByProjectIdAndId(actor.projectId, storageId);
    if (
      !(await this.access.canAccessStored(
        actor.userId,
        actor.roles,
        EntityType.STORAGE,
        storageId,
        Action.USE,
        actor.projectId
      ))
    )
      throw new ForbiddenException('You do not have permission to use this storage');
    return storage;
  }
  private async requireConnectorStorage(request: SetupConnectorRequest | SetupRequirementsRequest) {
    const storage = await this.requireUsableStorage(request, request.storageId);
    if (!this.mapper.supportsConnectorLoad(storage.type))
      throw new BadRequestException('Connector loads are not supported for this storage type');
  }
  private validatePage(request: { limit: number; offset?: number }) {
    if (
      !Number.isSafeInteger(request.limit) ||
      request.limit < 1 ||
      request.limit > 100 ||
      !Number.isSafeInteger(request.offset ?? 0) ||
      (request.offset ?? 0) < 0 ||
      (request.offset ?? 0) > 10000
    )
      throw new BadRequestException('Invalid result bounds');
  }
}
