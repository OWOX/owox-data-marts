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
  isTimeSeries?: boolean;
  isFullRefresh?: boolean;
  fields?: Record<string, SourceFieldDefinition>;
}

export interface SourceFieldsSchema {
  [key: string]: SourceFieldsGroup;
}

/** The part of a connector source the mapper reads: how each node is fetched by date. */
export interface SourceDateStrategies {
  getDateStrategy?: (nodeName: string) => string;
}

const NO_DATE_STRATEGY = 'none';

/**
 * Whether the engine fetches a node by date window, the way `AbstractConnector` decides it:
 * a time-series node that is not a full-refresh snapshot and whose source gives it a date
 * strategy. Anything else is a catalog loaded whole, regardless of the requested dates.
 */
function isTimeSeriesNode(
  nodeName: string,
  node: SourceFieldsGroup,
  source: SourceDateStrategies | undefined
): boolean {
  if (!node.isTimeSeries || node.isFullRefresh) return false;
  return source?.getDateStrategy?.(nodeName) !== NO_DATE_STRATEGY;
}

export function mapConnectorFieldsSchema(
  sourceFieldsSchema: SourceFieldsSchema,
  source?: SourceDateStrategies
) {
  return Object.keys(sourceFieldsSchema).map(key => ({
    name: key,
    overview: sourceFieldsSchema[key].overview,
    description: sourceFieldsSchema[key].description,
    documentation: sourceFieldsSchema[key].documentation,
    uniqueKeys: sourceFieldsSchema[key].uniqueKeys,
    uniqueKeysByDataLevel: sourceFieldsSchema[key].uniqueKeysByDataLevel,
    defaultFields: sourceFieldsSchema[key].defaultFields,
    destinationName: sourceFieldsSchema[key].destinationName,
    isTimeSeries: isTimeSeriesNode(key, sourceFieldsSchema[key], source),
    fields: Object.keys(sourceFieldsSchema[key].fields ?? {}).map(fieldKey => ({
      name: fieldKey,
      type: sourceFieldsSchema[key].fields?.[fieldKey].type,
      description: sourceFieldsSchema[key].fields?.[fieldKey].description,
    })),
  }));
}
