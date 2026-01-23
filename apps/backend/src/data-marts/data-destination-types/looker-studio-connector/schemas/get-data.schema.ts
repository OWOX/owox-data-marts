import { z } from 'zod';
import { FieldDataType } from '../enums/field-data-type.enum';
import { FilterOperatorType } from '../enums/filter-operator-type.enum';
import { ConnectionConfigSchema } from './connection-config.schema';
import { ConnectorRequestConfigV1Schema } from './connector-request-config.schema.v1';

// Schema for request field
export const RequestFieldSchema = z.object({
  name: z.string(),
  forFilterOnly: z.boolean().optional(),
});

// Schema for filter clause
export const FilterClauseSchema = z.object({
  fieldName: z.string(),
  operator: z.nativeEnum(FilterOperatorType),
  values: z.array(z.string()),
});

// Schema for sort order
export const SortOrderSchema = z.object({
  fieldName: z.string(),
  sortOrder: z.enum(['ASCENDING', 'DESCENDING']).optional(),
});

// Schema for date range
export const DateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

// Schema for getData request
export const GetDataRequestSchema = z.object({
  connectionConfig: ConnectionConfigSchema,
  request: z.object({
    configParams: ConnectorRequestConfigV1Schema,
    scriptParams: z
      .object({
        sampleExtraction: z.boolean().optional(),
        lastRefresh: z.string().optional(),
      })
      .optional(),
    dateRange: DateRangeSchema.optional(),
    fields: z.array(RequestFieldSchema),
    dimensionsFilters: z.array(z.array(FilterClauseSchema)).optional(),
  }),
});

// Schema for field value in data row
export const FieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

// Schema for data row
export const DataRowSchema = z.object({
  values: z.array(FieldValueSchema),
});

export enum GetDataLimitReason {
  ROW_LIMIT = 'rowLimit',
  SIZE_LIMIT = 'sizeLimit',
}

export const GetDataMetaSchema = z.object({
  limitExceeded: z.boolean(),
  limitReason: z.string().optional(),
  rowsSent: z.number(),
  bytesSent: z.number().optional(),
});

// Schema for getData response
export const GetDataResponseSchema = z.object({
  schema: z.array(
    z.object({
      name: z.string(),
      dataType: z.nativeEnum(FieldDataType),
    })
  ),
  rows: z.array(DataRowSchema),
  filtersApplied: z.array(FilterClauseSchema).optional(),
});

export type RequestField = z.infer<typeof RequestFieldSchema>;
export type FilterClause = z.infer<typeof FilterClauseSchema>;
export type SortOrder = z.infer<typeof SortOrderSchema>;
export type DateRange = z.infer<typeof DateRangeSchema>;
export type GetDataRequest = z.infer<typeof GetDataRequestSchema>;
export type FieldValue = z.infer<typeof FieldValueSchema>;
export type DataRow = z.infer<typeof DataRowSchema>;
export type GetDataResponse = z.infer<typeof GetDataResponseSchema>;
export type GetDataMeta = z.infer<typeof GetDataMetaSchema>;
export type GetDataResult = { response: GetDataResponse; meta: GetDataMeta };
