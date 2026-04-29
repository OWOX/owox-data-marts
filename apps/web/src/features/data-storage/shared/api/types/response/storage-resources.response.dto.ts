export interface StorageNamespaceNodeDto {
  id: string;
  label?: string;
}

export interface StorageResourceLeafDto {
  id: string;
  /** Parent group identifier (dataset, schema, …) */
  groupId: string;
  type: 'TABLE' | 'VIEW';
  fullyQualifiedName: string;
}

export type StorageResourceFilter = 'TABLE' | 'VIEW';

export interface ListStorageResourcesResponseDto {
  namespaces?: StorageNamespaceNodeDto[];
  resources?: StorageResourceLeafDto[];
}
