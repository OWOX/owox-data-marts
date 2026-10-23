export function isDuckDbStorageEnabled(values: {
  DUCKDB_STORAGE_ENABLED?: string;
  DB_TYPE?: string;
}): boolean {
  const explicit = values.DUCKDB_STORAGE_ENABLED?.trim().toLowerCase();
  if (explicit === 'true' || explicit === 'false') return explicit === 'true';
  const dbType = values.DB_TYPE?.trim().toLowerCase();
  return !dbType || dbType === 'sqlite';
}
