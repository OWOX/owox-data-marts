export interface BlendedFieldDisplayNameSource {
  name: string;
  outputPrefix?: string;
  alias?: string;
  originalFieldName?: string;
}

/**
 * The user-facing label of a blended field, shared by report headers and MCP field metadata.
 */
export function formatBlendedFieldDisplayName(field: BlendedFieldDisplayNameSource): string {
  const fieldName = field.alias || field.originalFieldName || field.name;

  return field.outputPrefix ? `${field.outputPrefix} ${fieldName}` : fieldName;
}
