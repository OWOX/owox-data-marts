interface SourceFieldDefinition {
  type?: string;
  description?: string;
}

interface SourceFieldsGroup {
  overview?: string;
  description?: string;
  documentation?: string;
  uniqueKeys?: string[];
  uniqueKeysByDataLevel?: Record<string, string[]>;
  defaultFields?: string[];
  destinationName?: string;
  fields?: Record<string, SourceFieldDefinition>;
}

export interface SourceFieldsSchema {
  [key: string]: SourceFieldsGroup;
}

export function mapConnectorFieldsSchema(sourceFieldsSchema: SourceFieldsSchema) {
  return Object.keys(sourceFieldsSchema).map(key => ({
    name: key,
    overview: sourceFieldsSchema[key].overview,
    description: sourceFieldsSchema[key].description,
    documentation: sourceFieldsSchema[key].documentation,
    uniqueKeys: sourceFieldsSchema[key].uniqueKeys,
    uniqueKeysByDataLevel: sourceFieldsSchema[key].uniqueKeysByDataLevel,
    defaultFields: sourceFieldsSchema[key].defaultFields,
    destinationName: sourceFieldsSchema[key].destinationName,
    fields: Object.keys(sourceFieldsSchema[key].fields ?? {}).map(fieldKey => ({
      name: fieldKey,
      type: sourceFieldsSchema[key].fields?.[fieldKey].type,
      description: sourceFieldsSchema[key].fields?.[fieldKey].description,
    })),
  }));
}
