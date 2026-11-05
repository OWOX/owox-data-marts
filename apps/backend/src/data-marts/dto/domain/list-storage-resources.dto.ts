import type {
  StorageResourceLeaf,
  StorageResourceNode,
} from '../../data-storage-types/interfaces/storage-resource-browser.interface';

export interface ListStorageResourcesDto {
  namespaces?: StorageResourceNode[];
  resources?: StorageResourceLeaf[];
}
