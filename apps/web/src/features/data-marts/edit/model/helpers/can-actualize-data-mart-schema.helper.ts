import { DataMartDefinitionType } from '../../../shared';
import {
  DataMartSchemaFieldStatus,
  type BaseSchemaField,
  type DataMartSchema,
} from '../../../shared/types/data-mart-schema.types';

/**
 * Determines if data mart schema can be actualized (refreshed/synchronized with data storage).
 *
 * Schema actualization rules:
 * - For non-CONNECTOR definition types (SQL, etc.): always allowed
 * - For CONNECTOR definition type: allowed only when at least one field has CONNECTED status
 *
 * This prevents actualization attempts on connector-based data marts because the schema is created and updated by the connector itself. If there is no field with CONNECTED status, it means that the connector did not create the schema.
 *
 * @param definitionType - The type of data mart definition (SQL, CONNECTOR, etc.)
 * @param schema - Current data mart schema containing fields and their statuses
 * @returns `true` if schema actualization is allowed, `false` otherwise
 *
 */
export const canActualizeSchema = (
  definitionType: DataMartDefinitionType | null,
  schema: DataMartSchema | null
): boolean => {
  if (definitionType !== DataMartDefinitionType.CONNECTOR) {
    return true;
  }

  if (schema !== null) {
    const isAnyConnectedField = schema.fields.some(
      (field: BaseSchemaField) => field.status === DataMartSchemaFieldStatus.CONNECTED
    );

    if (isAnyConnectedField) {
      return true;
    }
  }

  return false;
};
