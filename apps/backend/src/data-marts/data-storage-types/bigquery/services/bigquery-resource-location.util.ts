import type { StorageResourceLeaf } from '../../interfaces/storage-resource-browser.interface';

/**
 * Flags every leaf stored outside the location the storage runs queries in.
 *
 * A BigQuery job runs in a single location and reads only datasets stored there, so a data
 * mart on a storage pinned to `EU` cannot query a table in `US`. Location names are
 * case-insensitive (`EU` and `eu` match), while a multi-region and a region inside it
 * (`US` and `us-central1`) are different locations.
 *
 * Leaves come back untouched when the storage has no fixed location (auto-detect) or the
 * leaf's own location is unknown — there is nothing to compare.
 */
export function flagLocationMismatches(
  leaves: StorageResourceLeaf[],
  storageLocation: string | undefined
): StorageResourceLeaf[] {
  if (!storageLocation) return leaves;
  const expected = storageLocation.toLowerCase();
  return leaves.map(leaf =>
    leaf.location ? { ...leaf, locationMismatch: leaf.location.toLowerCase() !== expected } : leaf
  );
}
