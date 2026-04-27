import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataStorage } from '../../entities/data-storage.entity';
import { STORAGE_RESOURCE_BROWSER_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import type {
  IStorageResourceBrowserProvider,
  StorageResourceFilter,
  StorageResourceLeaf,
  StorageResourceNode,
} from '../interfaces/storage-resource-browser.interface';

/**
 * Facade that dispatches resource-browsing calls to the correct
 * {@link IStorageResourceBrowserProvider} for the given storage type.
 *
 * Throws {@link BadRequestException} when no provider is registered for a type,
 * matching the behaviour of every other facade in this directory.
 */
@Injectable()
export class StorageResourceBrowserFacade {
  constructor(
    @Inject(STORAGE_RESOURCE_BROWSER_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, IStorageResourceBrowserProvider>
  ) {}

  async listNamespaces(storage: DataStorage): Promise<StorageResourceNode[]> {
    const provider = await this.resolver.tryResolve(storage.type);
    if (!provider) {
      throw new BadRequestException(
        `Resource browsing is not supported for storage type: ${storage.type}`
      );
    }
    return provider.listNamespaces(storage);
  }

  async listLeafResources(
    storage: DataStorage,
    namespaceId: string,
    filter?: StorageResourceFilter
  ): Promise<StorageResourceLeaf[]> {
    const provider = await this.resolver.tryResolve(storage.type);
    if (!provider) {
      throw new BadRequestException(
        `Resource browsing is not supported for storage type: ${storage.type}`
      );
    }
    return provider.listLeafResources(storage, namespaceId, filter);
  }
}
