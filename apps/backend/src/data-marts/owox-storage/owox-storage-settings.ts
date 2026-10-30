export type OwoxStorageLocation = 'US' | 'EU';
export const OWOX_STORAGE_LOCATIONS: readonly OwoxStorageLocation[] = ['US', 'EU'];

export interface OwoxStorageSettings {
  engine: 'bigquery';
  gcpProjectId: string;
  serviceAccountProjectId: string;
  freeQueryLimitBytesPerDay: number;
  paidQueryLimitBytesPerDay: number;
  freeStorageLimitBytes: number;
  paidIncludedStorageBytes: number;
}

const GIB = 2 ** 30;

/** Returns null when OWOX Storage is off; a partial or unknown configuration throws. */
export function readOwoxStorageSettings(env: Record<string, unknown>): OwoxStorageSettings | null {
  // ConfigService returns validated values, so a limit can already be a number.
  const read = (name: string) => {
    const value = env[name];
    return (value == null ? undefined : String(value).trim()) || undefined;
  };

  const engine = read('OWOX_STORAGE_ENGINE');
  if (!engine) return null;
  if (engine !== 'bigquery') {
    throw new Error(`OWOX_STORAGE_ENGINE supports only "bigquery", got "${engine}".`);
  }

  const gcpProjectId = read('OWOX_STORAGE_GCP_PROJECT_ID');
  if (!gcpProjectId) {
    throw new Error(
      'OWOX Storage is partially configured. OWOX_STORAGE_GCP_PROJECT_ID is required when OWOX_STORAGE_ENGINE is set.'
    );
  }

  const limitGib = (name: string, fallback: number) => {
    const value = read(name);
    if (value === undefined) return fallback;
    const gib = Number(value);
    if (!Number.isFinite(gib) || gib <= 0) throw new Error(`${name} must be a positive number.`);
    return gib;
  };

  return {
    engine,
    gcpProjectId,
    serviceAccountProjectId: read('OWOX_STORAGE_SERVICE_ACCOUNT_PROJECT_ID') ?? gcpProjectId,
    freeQueryLimitBytesPerDay: limitGib('OWOX_STORAGE_FREE_QUERY_LIMIT_GIB_PER_DAY', 10) * GIB,
    paidQueryLimitBytesPerDay: limitGib('OWOX_STORAGE_PAID_QUERY_LIMIT_GIB_PER_DAY', 100) * GIB,
    freeStorageLimitBytes: limitGib('OWOX_STORAGE_FREE_STORAGE_LIMIT_GIB', 1) * GIB,
    paidIncludedStorageBytes: limitGib('OWOX_STORAGE_PAID_INCLUDED_STORAGE_GIB', 10) * GIB,
  };
}
