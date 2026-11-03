// Imported by migration 1793000000000: keep it when the legacy code goes.
import { CREDENTIAL_CONSUMER_TYPE_CONNECTOR_CONFIG } from '../../credentials/credential.types';

const DEFINITION = 'CAST(dataMart.definition AS CHAR)';

/** Portable SQL cannot walk a JSON array, so configurations are counted by their `"_id"` keys. */
const CONFIGURATIONS = `(LENGTH(${DEFINITION}) - LENGTH(REPLACE(${DEFINITION}, '"_id"', ''))) / 5`;

/** The binding rows of `dataMart`'s configurations that also meet `condition`. */
const bindingRows = (condition: string) => `(
  SELECT COUNT(*) FROM credential_consumer_binding binding
  WHERE binding.consumerType = '${CREDENTIAL_CONSUMER_TYPE_CONNECTOR_CONFIG}'
    AND binding.consumerId = dataMart.id${condition})`;

const LIVE_CONNECTOR_DATA_MART =
  "dataMart.deletedAt IS NULL AND dataMart.definitionType = 'CONNECTOR'";

/** Live connector Data Marts whose runs still read old key rows; remove the legacy code once no deployment returns any. */
export const SOURCES_ON_OLD_KEY_SQL = `
SELECT dataMart.id AS id, dataMart.projectId AS projectId
FROM data_mart dataMart
WHERE ${LIVE_CONNECTOR_DATA_MART}
  AND (INSTR(${DEFINITION}, '"_secrets_id"') > 0
    OR INSTR(${DEFINITION}, '"_source_credential_id"') > 0)
  AND ${CONFIGURATIONS} > ${bindingRows(
    ' AND binding.active = 1 AND binding.projectId = dataMart.projectId'
  )}`;

/** Live connector Data Marts with a configuration on no binding row in any project or state, as the unique index ignores both. */
export const UNCONVERTED_SOURCE_CONFIGS_SQL = `
SELECT dataMart.id AS id, dataMart.projectId AS projectId
FROM data_mart dataMart
WHERE ${LIVE_CONNECTOR_DATA_MART} AND ${CONFIGURATIONS} > ${bindingRows('')}`;
