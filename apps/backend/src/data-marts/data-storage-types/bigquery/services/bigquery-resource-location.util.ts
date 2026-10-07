import type { StorageResourceLeaf } from '../../interfaces/storage-resource-browser.interface';

/**
 * True when a resource stored in `resourceLocation` sits outside the location a storage runs
 * queries in, so a BigQuery job on that storage cannot read it.
 *
 * A BigQuery job runs in a single location and reads only datasets stored there, so a data
 * mart on a storage pinned to `EU` cannot query a table in `US`. Location names are
 * case-insensitive (`EU` and `eu` match), while a multi-region and a region inside it
 * (`US` and `us-central1`) are different locations.
 *
 * Returns `undefined` when either location is unknown — for example, when the storage
 * auto-detects its location — because there is nothing to compare.
 */
export function isOutsideStorageLocation(
  resourceLocation: string | undefined,
  storageLocation: string | undefined
): boolean | undefined {
  if (!resourceLocation || !storageLocation) return undefined;
  return resourceLocation.toLowerCase() !== storageLocation.toLowerCase();
}

/**
 * Flags every leaf stored outside the storage location (see {@link isOutsideStorageLocation}).
 * Leaves come back untouched when there is nothing to compare.
 */
export function flagLocationMismatches(
  leaves: StorageResourceLeaf[],
  storageLocation: string | undefined
): StorageResourceLeaf[] {
  if (!storageLocation) return leaves;
  return leaves.map(leaf => {
    const locationMismatch = isOutsideStorageLocation(leaf.location, storageLocation);
    return locationMismatch === undefined ? leaf : { ...leaf, locationMismatch };
  });
}
