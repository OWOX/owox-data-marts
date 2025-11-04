import { DataMartDefinitionType } from '../../../shared';
import {
  DataMartSchemaFieldStatus,
  type BaseSchemaField,
  type DataMartSchema,
} from '../../../shared/types/data-mart-schema.types';

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
