/**
 * Parse MySQL SSL env variable into a value suitable for mysql2 `createPool({ ssl })`.
 *
 * Supported inputs (as strings):
 * - 'true'  => {}
 * - 'false' => undefined
 * - JSON    => parsed object (e.g. {"rejectUnauthorized":true,"ca":"..."})
 *
 * @param raw Raw env value
 * @returns
 *  - {} for "true"
 *  - undefined for "false", empty or non-string
 *  - Parsed object for valid JSON
 *  - Raw string otherwise (pass-through)
 *
 * @see https://github.com/OWOX/owox-data-marts/blob/main/docs/getting-started/deployment-guide/environment-variables.md#mysql-ssl
 * @see https://sidorares.github.io/node-mysql2/docs/documentation/ssl
 * @example
 * parseMysqlSslEnv('true') // {}
 * parseMysqlSslEnv('false') // undefined
 * parseMysqlSslEnv('{"rejectUnauthorized":true}') // { rejectUnauthorized: true }
 */
export function parseMysqlSslEnv(raw?: string): unknown {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  const lower = trimmed.toLowerCase();
  if (lower === 'true') return {};
  if (lower === 'false') return undefined;

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}
