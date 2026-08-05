import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import type { DataMartDefinitionDto } from '../../shared/types/api/response/data-mart-definition.dto';

/**
 * The data mart definition as a single string for the canvas export: the
 * physical table/view reference, the table pattern, or the SQL query.
 * Connector definitions are deliberately excluded — their source config can
 * carry sensitive parameters, unlike a plain table path or query text.
 */
export function extractDefinitionText(
  definitionType: DataMartDefinitionType | null,
  definition: DataMartDefinitionDto | null
): string | null {
  if (!definitionType || !definition) return null;
  switch (definitionType) {
    case DataMartDefinitionType.SQL:
      return 'sqlQuery' in definition ? definition.sqlQuery : null;
    case DataMartDefinitionType.TABLE:
    case DataMartDefinitionType.VIEW:
      return 'fullyQualifiedName' in definition ? definition.fullyQualifiedName : null;
    case DataMartDefinitionType.TABLE_PATTERN:
      return 'pattern' in definition ? definition.pattern : null;
    case DataMartDefinitionType.CONNECTOR:
      return null;
  }
}
