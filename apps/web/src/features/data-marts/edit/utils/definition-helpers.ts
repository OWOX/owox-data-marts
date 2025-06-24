import { DataMartDefinitionType } from '../../shared';

/**
 * Returns an empty definition object based on the provided definition type
 */
export const getEmptyDefinition = (type: DataMartDefinitionType) => {
  switch (type) {
    case DataMartDefinitionType.SQL:
      return { sqlQuery: '-- Start writing your SQL query here...' };
    case DataMartDefinitionType.TABLE:
      return { fullyQualifiedName: '' };
    case DataMartDefinitionType.VIEW:
      return { fullyQualifiedName: '' };
    case DataMartDefinitionType.TABLE_PATTERN:
      return { pattern: '' };
    default:
      return {};
  }
};
