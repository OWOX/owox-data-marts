/** `binding` is the storage binding row of `storage`, in any project and state; plain portable SQL. */
const STORAGE_BINDING_ROW =
  "binding.consumerType = 'storage' AND binding.consumerId = storage.id" +
  " AND binding.requirementKey = 'storage'";

/** `binding` is the active binding of `storage`, in whatever project it sits; plain portable SQL. */
export const ACTIVE_STORAGE_BINDING = `${STORAGE_BINDING_ROW} AND binding.active = 1`;

/**
 * Live Storages the runtime still resolves from their live old key row: no active binding in their
 * own project. Remove the legacy code once this returns no rows on every deployment; one release
 * later, drop `data_storage_credentials` and `data_storage.credentialId`. Keep this file and the
 * conversion plan: migration 1792600000000 imports them.
 */
export const STORAGES_ON_OLD_KEY_SQL = `
SELECT storage.id AS id, storage.projectId AS projectId
FROM data_storage storage
INNER JOIN data_storage_credentials oldKey
  ON oldKey.id = storage.credentialId AND oldKey.deletedAt IS NULL
WHERE storage.deletedAt IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM credential_consumer_binding binding
    WHERE ${ACTIVE_STORAGE_BINDING} AND binding.projectId = storage.projectId
  )`;

/**
 * Live Storages on a live old key row that the conversion migration binds: no storage binding row in
 * any project, as the unique index of a new binding ignores both the project and `active`.
 */
export const UNCONVERTED_STORAGES_SQL = `
SELECT storage.id AS id, storage.projectId AS projectId
FROM data_storage storage
INNER JOIN data_storage_credentials oldKey
  ON oldKey.id = storage.credentialId AND oldKey.deletedAt IS NULL
WHERE storage.deletedAt IS NULL
  AND NOT EXISTS (SELECT 1 FROM credential_consumer_binding binding WHERE ${STORAGE_BINDING_ROW})`;
