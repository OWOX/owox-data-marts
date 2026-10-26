export const STORAGE_CREDENTIAL_IDENTITIES_FACADE = Symbol('STORAGE_CREDENTIAL_IDENTITIES_FACADE');

/** What search indexing may learn about a Storage's Credential: the identity it names, no more. */
export interface StorageCredentialIdentitiesFacade {
  /** Bound Storages, then unbound ones on an old key; null when the key names no identity. */
  identitiesForStorages(
    projectId: string,
    storageIds: readonly string[]
  ): Promise<ReadonlyMap<string, string | null>>;
}
