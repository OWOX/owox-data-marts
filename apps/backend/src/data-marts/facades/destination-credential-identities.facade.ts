export const DESTINATION_CREDENTIAL_IDENTITIES_FACADE = Symbol(
  'DESTINATION_CREDENTIAL_IDENTITIES_FACADE'
);

/** What search indexing may learn about a Destination's bound Credential: the identity it names, no more. */
export interface DestinationCredentialIdentitiesFacade {
  /** Bound Destinations only; null when the Credential names no identity or was deleted. */
  identitiesForDestinations(
    projectId: string,
    destinationIds: readonly string[]
  ): Promise<ReadonlyMap<string, string | null>>;
}
