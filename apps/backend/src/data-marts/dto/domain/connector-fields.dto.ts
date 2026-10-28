export interface ConnectorFieldsDto {
  name: string;
  overview?: string;
  description?: string;
  documentation?: string;
  uniqueKeys?: string[];
  uniqueKeysByDataLevel?: Record<string, string[]>;
  defaultFields?: string[];
  destinationName?: string;
  fields?: Array<{
    name: string;
    type?: string;
    description?: string;
  }>;
}
