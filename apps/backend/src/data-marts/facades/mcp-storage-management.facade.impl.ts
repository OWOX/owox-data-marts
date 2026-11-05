import type { AuthorizationContext } from '../../idp';
import { Injectable } from '@nestjs/common';
import { CreateDataStorageCommand } from '../dto/domain/create-data-storage.command';
import { DeleteDataStorageCommand } from '../dto/domain/delete-data-storage.command';
import { GetDataStorageCommand } from '../dto/domain/get-data-storage.command';
import { ListDataStoragesCommand } from '../dto/domain/list-data-storages.command';
import {
  ListStorageResourcesCommand,
  StorageResourceLevel,
} from '../dto/domain/list-storage-resources.command';
import { ValidateDataStorageAccessCommand } from '../dto/domain/validate-data-storage-access.command';
import type {
  McpListStoragesInput,
  McpCreateStorageInput,
  McpUpdateStorageInput,
  McpSetStorageAccessInput,
  McpListStorageResourcesInput,
} from './mcp-storage-management.facade';
import { McpStorageMapper } from '../mappers/mcp-storage.mapper';
import { CreateDataStorageService } from '../use-cases/create-data-storage.service';
import { DeleteDataStorageService } from '../use-cases/delete-data-storage.service';
import { GetDataStorageService } from '../use-cases/get-data-storage.service';
import { ListDataStoragesService } from '../use-cases/list-data-storages.service';
import { ListStorageResourcesService } from '../use-cases/list-storage-resources.service';
import { UpdateDataStorageService } from '../use-cases/update-data-storage.service';
import { ValidateDataStorageAccessService } from '../use-cases/validate-data-storage-access.service';
import type { McpStorageManagementFacade } from './mcp-storage-management.facade';

@Injectable()
export class McpStorageManagementFacadeImpl implements McpStorageManagementFacade {
  constructor(
    private readonly listStorages: ListDataStoragesService,
    private readonly getStorage: GetDataStorageService,
    private readonly createStorage: CreateDataStorageService,
    private readonly updateStorage: UpdateDataStorageService,
    private readonly validateStorage: ValidateDataStorageAccessService,
    private readonly listStorageResources: ListStorageResourcesService,
    private readonly deleteStorage: DeleteDataStorageService,
    private readonly mapper: McpStorageMapper
  ) {}

  async list(actor: AuthorizationContext, input: McpListStoragesInput) {
    const storages = await this.listStorages.run(
      new ListDataStoragesCommand(
        actor.projectId,
        actor.userId,
        actor.roles ?? [],
        input.ownerFilter
      )
    );
    return storages
      .filter(
        storage =>
          (input.type === undefined || storage.type === input.type) &&
          (input.ownerId === undefined ||
            storage.ownerUsers.some(owner => owner.userId === input.ownerId))
      )
      .map(storage => this.mapper.toSummary(storage));
  }

  async get(actor: AuthorizationContext, id: string) {
    const storage = await this.getStorage.run(
      new GetDataStorageCommand(id, actor.projectId, actor.userId, actor.roles)
    );
    return this.mapper.toStorage(storage);
  }

  async create(actor: AuthorizationContext, input: McpCreateStorageInput) {
    const storage = await this.createStorage.run(
      new CreateDataStorageCommand(
        actor.projectId,
        input.type,
        actor.userId,
        undefined,
        input.title
      )
    );
    return this.mapper.toStorage(storage);
  }

  async update(actor: AuthorizationContext, id: string, input: McpUpdateStorageInput) {
    const storage = await this.updateStorage.run(this.mapper.toUpdateCommand(actor, id, input));
    return this.mapper.toStorage(storage);
  }

  async setAccess(actor: AuthorizationContext, id: string, input: McpSetStorageAccessInput) {
    await this.updateStorage.run(this.mapper.toAccessCommand(actor, id, input));
  }

  async validate(actor: AuthorizationContext, id: string) {
    const result = await this.validateStorage.run(
      new ValidateDataStorageAccessCommand(id, actor.projectId, actor.userId, actor.roles)
    );
    return this.mapper.toValidation(result);
  }

  async listResources(
    actor: AuthorizationContext,
    id: string,
    input: McpListStorageResourcesInput
  ) {
    const result = await this.listStorageResources.run(
      new ListStorageResourcesCommand(
        id,
        actor.projectId,
        actor.userId,
        actor.roles ?? [],
        input.level === 'namespaces'
          ? StorageResourceLevel.NAMESPACES
          : StorageResourceLevel.RESOURCES,
        input.namespaceId,
        input.resourceType
      )
    );
    return result.namespaces
      ? this.mapper.toNamespaces(result.namespaces)
      : this.mapper.toResources(result.resources ?? []);
  }

  async delete(actor: AuthorizationContext, id: string) {
    await this.deleteStorage.run(
      new DeleteDataStorageCommand(id, actor.projectId, actor.userId, actor.roles)
    );
  }
}
