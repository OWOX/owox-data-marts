export const STREAM_BATCH_SIZE = 5000;

export const HTTP_DATA_RUN_ID_HEADER = 'x-owox-run-id';

export const HTTP_DATA_TOTAL_ROW_COUNT_HEADER = 'x-owox-total-row-count';

// The count runs before the first row, so this limit is also the longest delay it adds.
export const HTTP_DATA_TOTAL_ROW_COUNT_TIMEOUT_MS = 60_000;

export const HTTP_DATA_PARAMS_KEY = 'httpData';

export const HTTP_DATA_SCHEMA_EXPIRES_AFTER_MS = 30 * 60 * 1000;

export const HTTP_DATA_RUN_INTERRUPTED_MESSAGE =
  'The run did not record its end. The server stopped, or it could not save the result.';

export const HTTP_DATA_RUN_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
