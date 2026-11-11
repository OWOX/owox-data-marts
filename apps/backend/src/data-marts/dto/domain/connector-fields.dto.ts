export interface ConnectorFieldsDto {
  name: string;
  overview?: string;
  description?: string;
  documentation?: string;
  uniqueKeys?: string[];
  uniqueKeysByDataLevel?: Record<string, string[]>;
  defaultFields?: string[];
  destinationName?: string;
  /** False for a catalog that a backfill loads once. Absent means unknown: treat it as fetched by date. */
  isFetchedByDate?: boolean;
  fields?: Array<{
    name: string;
    type?: string;
    description?: string;
  }>;
}
