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
  /** Where the resource's data lives (BigQuery dataset location, e.g. `US`, `europe-west1`). */
  location?: string;
  /**
   * True when the resource lives outside the location the storage runs queries in, so a
   * data mart on this storage cannot read it. Absent when either location is unknown.
   */
  locationMismatch?: boolean;
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
