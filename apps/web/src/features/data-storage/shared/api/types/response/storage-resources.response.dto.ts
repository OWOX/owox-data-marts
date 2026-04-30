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

/**
 * Filter accepted by the storage-resources listing API.
 *
 * - `TABLE`         — concrete tables only (no views, no wildcard rollups).
 * - `VIEW`          — concrete views only.
 * - `TABLE_PATTERN` — wildcard rollups for sharded tables (e.g. `events_*`).
 *                    Backend returns one entry per `(group, prefix)` whose
 *                    `fullyQualifiedName` already contains the `*` wildcard.
 *
 * When omitted the response combines: views + non-sharded tables + wildcard rollups
 * (the individual shards are folded into their wildcard).
 */
export type StorageResourceFilter = 'TABLE' | 'VIEW' | 'TABLE_PATTERN';

export interface ListStorageResourcesResponseDto {
  namespaces?: StorageNamespaceNodeDto[];
  resources?: StorageResourceLeafDto[];
}
