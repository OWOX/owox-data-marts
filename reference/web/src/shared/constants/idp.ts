// Centralized IDP provider identifiers used across the web app
// Extend this enum and the union type when adding new providers.

export enum IdpProvider {
  NULL = 'idp-null',
  BETTER_AUTH = 'idp-better-auth',
  OWOX = 'idp-owox',
}

// Convenience string union type (useful for plain objects / settings payloads)
export type IdpProviderName = `${IdpProvider}`;
