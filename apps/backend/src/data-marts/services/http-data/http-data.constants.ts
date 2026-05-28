export const STREAM_BATCH_SIZE = 5000;

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const HTTP_DATA_MAX_ROWS = envPositiveInt('HTTP_DATA_MAX_ROWS', 10_000_000);

export const HTTP_DATA_MAX_BYTES = envPositiveInt('HTTP_DATA_MAX_BYTES', 1_073_741_824);

export const HTTP_DATA_REQUEST_TIMEOUT_MS = envPositiveInt('HTTP_DATA_REQUEST_TIMEOUT_MS', 300_000);

export const HTTP_DATA_RUN_ID_HEADER = 'x-owox-run-id';
export const HTTP_DATA_COLUMNS_HEADER = 'x-owox-columns';

export const HTTP_DATA_PARAMS_KEY = 'httpData';

export const HTTP_DATA_SCHEMA_EXPIRES_AFTER_MS = 30 * 60 * 1000;
