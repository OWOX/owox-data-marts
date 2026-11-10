export interface ConnectorFieldsDto {
  name: string;
  overview?: string;
  description?: string;
  documentation?: string;
  uniqueKeys?: string[];
  uniqueKeysByDataLevel?: Record<string, string[]>;
  defaultFields?: string[];
  destinationName?: string;
  /** Fetched by date window; absent or false for a catalog that a backfill loads once. */
  isTimeSeries?: boolean;
  fields?: Array<{
    name: string;
    type?: string;
    description?: string;
  }>;
}
