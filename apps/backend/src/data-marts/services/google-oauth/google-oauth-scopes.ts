// Imported by migration 1792700000000: keep it and its imports when the legacy code goes.
/** OAUTH_GOOGLE_BIGQUERY_SCOPE when it lists none. */
export const DEFAULT_BIGQUERY_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/bigquery',
  'openid',
  'email',
  'profile',
];

/** OAUTH_GOOGLE_SHEETS_SCOPE when it lists none. */
export const DEFAULT_SHEETS_SCOPES: readonly string[] = [
  'https://www.googleapis.com/auth/spreadsheets',
  // drive.file is NON-restricted (no CASA assessment). It lets the app manage
  // (incl. share via permissions.create) the files it CREATES — used to grant
  // the requesting user access to an auto-created Sheet. Existing tokens need
  // re-consent to gain it.
  'https://www.googleapis.com/auth/drive.file',
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
