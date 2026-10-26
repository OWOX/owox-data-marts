/** OAUTH_GOOGLE_BIGQUERY_SCOPE when it lists none. */
export const DEFAULT_BIGQUERY_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/bigquery',
  'openid',
  'email',
  'profile',
];

/** A comma-separated scope list without empty entries; a list of none keeps the default. */
export function scopeList(value: string | undefined): string[] | undefined {
  const scopes = (value ?? '')
    .split(',')
    .map(scope => scope.trim())
    .filter(Boolean);
  return scopes.length ? scopes : undefined;
}
