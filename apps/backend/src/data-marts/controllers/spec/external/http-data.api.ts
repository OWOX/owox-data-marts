import { applyDecorators } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { IN_LIST_MAX_VALUES } from '../../../dto/schemas/filter-config.schema';
import { HTTP_DATA_MAX_ENCODED_PARAM_LENGTH } from '../../../dto/schemas/http-data-query.schema';
import { UNIQUE_COUNT_CONFIG_MAX_SOURCES } from '../../../dto/schemas/unique-count-config.schema';

const ENCODED_HTTP_DATA_QUERY_SCHEMA = {
  type: 'string',
  minLength: 1,
  maxLength: HTTP_DATA_MAX_ENCODED_PARAM_LENGTH,
} as const;

export function StreamHttpDataSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Stream Data Mart data as NDJSON',
      description:
        'Streams rows of a published Data Mart as newline-delimited JSON ' +
        '(one data row per line, no envelope). Output selectors use `columns=*` or ' +
        '`columns=**`; exact column names use repeated `column` parameters. Row objects ' +
        'use resolved column names as keys in the requested order. Omit both `columns` ' +
        'and `column` (without `uniqueCount`), or pass `columns=*`, for all native columns. ' +
        'Pass `columns=**` ' +
        'for all native plus all reporting-visible blended columns. When `aggregation` or ' +
        '`dateTrunc` is used the row keys are the RESOLVED output labels — an aggregated ' +
        'column becomes `"<column> | <TOKEN>"`, where `<TOKEN>` is an uppercase ' +
        'spreadsheet-style token for the function (most match the function name, but ' +
        '`COUNT_DISTINCT` becomes `COUNTUNIQUE`, `P50` becomes `MEDIAN`, `STRING_AGG` becomes ' +
        '`STRINGAGG`, `ANY_VALUE` becomes `ANYVALUE`) — and an explicit `column` projection is ' +
        'required (a wildcard selector ' +
        'would group by every column). With `uniqueCount` each requested source adds a ' +
        '`COUNT(DISTINCT <primary key>)` column, keyed `Unique Count` for the Data Mart itself ' +
        'and `<alias path>__unique_count` for a joined source (dots in the path become `_`). ' +
        'Authenticated ' +
        'with the ODM member token via `x-owox-authorization`. Successful executions and ' +
        'execution failures are recorded as DataMartRuns of type HTTP_DATA, available through ' +
        'the run history endpoint. Requests rejected because of invalid query configuration ' +
        'are not recorded.',
    }),
    ApiParam({
      name: 'dataMartId',
      description:
        'Data Mart identifier (UUID for native Data Marts, free-form string for legacy ones)',
    }),
    ApiQuery({
      name: 'columns',
      description:
        'Optional column-set selector. `*` selects all current Data Mart output columns; ' +
        '`**` selects all columns available to Reports, including joined fields. ' +
        '`columns=*` may be combined with repeated `column` values. `columns=**` cannot ' +
        'be combined with `column` or another `columns` value. Omit `columns` and ' +
        '`column` to select all current Data Mart output columns, unless `uniqueCount` is ' +
        'given: then the read returns a single total row. Selectors never include a field ' +
        'hidden from reports; name it with `column` to read it.',
      required: false,
      enum: ['*', '**'],
      example: '*',
    }),
    ApiQuery({
      name: 'column',
      description:
        'Exact column name to include in the output. Repeat the parameter to select ' +
        'multiple exact column names; the order of repetition is preserved in row ' +
        'objects. Values are opaque strings. `column=*` and `column=**` refer to literal ' +
        'columns named `*` and `**`; use `columns=*` or `columns=**` for selectors. ' +
        'Overlaps are de-duplicated. A Data Mart field hidden from reports is returned when ' +
        'named here or in `filter`, `sort`, `aggregation`, `dateTrunc` or `havingGroupBy` — for ' +
        'example a hidden primary key a client selects a row by. A hidden calculated field and ' +
        "a joined Data Mart's hidden field stay unavailable.",
      required: false,
      schema: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
      },
      example: ['date', 'revenue'],
    }),
    ApiQuery({
      name: 'filter',
      description:
        'Optional base64url-encoded JSON matching the `FilterConfig` schema (same shape as Reports), ' +
        'applied server-side before streaming. Encode the JSON array with base64url ' +
        '(URL-safe base64: `-`/`_` instead of `+`/`/`, no `=` padding) so it survives the query string. ' +
        'Example JSON: `[{"column":"date","operator":"gte","value":"2026-01-01"}]` → ' +
        'base64url `W3siY29sdW1uIjoiZGF0ZSIsIm9wZXJhdG9yIjoiZ3RlIiwidmFsdWUiOiIyMDI2LTAxLTAxIn1d`. ' +
        `\`in\`/\`not_in\` rules take an array of 1..${String(IN_LIST_MAX_VALUES)} same-type values (never a comma-separated ` +
        'string): `[{"column":"country","operator":"in","value":["Germany","Ukraine"]}]`. ' +
        `The whole encoded parameter is capped at ${String(HTTP_DATA_MAX_ENCODED_PARAM_LENGTH)} characters ` +
        '(~6 KB of JSON), so with long values that length cap can bind before the value-count cap does.',
      required: false,
      schema: ENCODED_HTTP_DATA_QUERY_SCHEMA,
      example: 'W3siY29sdW1uIjoiZGF0ZSIsIm9wZXJhdG9yIjoiZ3RlIiwidmFsdWUiOiIyMDI2LTAxLTAxIn1d',
    }),
    ApiQuery({
      name: 'sort',
      description:
        'Optional base64url-encoded JSON matching the `SortConfig` schema, applied server-side. ' +
        'Encode the JSON array with base64url ' +
        '(URL-safe base64: `-`/`_` instead of `+`/`/`, no `=` padding). ' +
        'Example JSON: `[{"column":"date","direction":"desc"}]` → ' +
        'base64url `W3siY29sdW1uIjoiZGF0ZSIsImRpcmVjdGlvbiI6ImRlc2MifV0`.',
      required: false,
      schema: ENCODED_HTTP_DATA_QUERY_SCHEMA,
      example: 'W3siY29sdW1uIjoiZGF0ZSIsImRpcmVjdGlvbiI6ImRlc2MifV0',
    }),
    ApiQuery({
      name: 'aggregation',
      description:
        'Optional base64url-encoded JSON matching the `AggregationConfig` schema (same rule shape ' +
        'as Reports: an array of `{ column, function }`). Any selected column without an ' +
        'aggregation rule becomes a grouping key. Encode the JSON array with base64url ' +
        '(URL-safe base64: `-`/`_` instead of `+`/`/`, no `=` padding). ' +
        'Example JSON: `[{"column":"revenue","function":"SUM"}]` → ' +
        'base64url `W3siY29sdW1uIjoicmV2ZW51ZSIsImZ1bmN0aW9uIjoiU1VNIn1d`.',
      required: false,
      schema: ENCODED_HTTP_DATA_QUERY_SCHEMA,
      example: 'W3siY29sdW1uIjoicmV2ZW51ZSIsImZ1bmN0aW9uIjoiU1VNIn1d',
    }),
    ApiQuery({
      name: 'dateTrunc',
      description:
        'Optional base64url-encoded JSON matching the `DateTruncConfig` schema (same rule shape ' +
        'as Reports: an array of `{ column, unit, timeZone? }`), bucketing a date/timestamp ' +
        'dimension by a calendar unit (DAY/WEEK/MONTH/QUARTER/YEAR). Encode the JSON array with ' +
        'base64url (URL-safe base64: `-`/`_` instead of `+`/`/`, no `=` padding). ' +
        'Example JSON: `[{"column":"date","unit":"MONTH"}]` → ' +
        'base64url `W3siY29sdW1uIjoiZGF0ZSIsInVuaXQiOiJNT05USCJ9XQ`.',
      required: false,
      schema: ENCODED_HTTP_DATA_QUERY_SCHEMA,
      example: 'W3siY29sdW1uIjoiZGF0ZSIsInVuaXQiOiJNT05USCJ9XQ',
    }),
    ApiQuery({
      name: 'havingGroupBy',
      description:
        'Optional base64url-encoded JSON object that sets a separate grouping for the metric ' +
        'filters (`filter` rules with `function`, and rules on an aggregate-level Calculated ' +
        'Field). The read finds the groups of this grouping that pass the metric filters, with ' +
        'the other filters applied, keeps the rows of those groups, and then groups and ' +
        'aggregates the kept rows by its own columns. ' +
        'Shape: `{ "column": [<key>, ...], "dateTrunc"?: [{ column, unit, timeZone? }] }`. ' +
        '`column` lists the grouping keys. A key can appear only once. An empty list makes one ' +
        'group, so the metric filters apply to the total. A key is a native column, a visible ' +
        'joined column (`<alias path>__<field>`) or a row-level Calculated Field, and it does ' +
        'not have to be in the read’s `column` list. A Unique Count key, an aggregate-level ' +
        'Calculated Field and a key of a type that cannot be grouped (for example ARRAY, STRUCT ' +
        'or JSON) are rejected. Each `dateTrunc` rule names a different key from `column` and ' +
        'follows the rules of the read’s own `dateTrunc`. The read’s own `dateTrunc` does not ' +
        'apply to this grouping. The read must have at least one metric filter. `sort` and ' +
        '`limit` apply to the read’s own result only. The run records the grouping as ' +
        '`additionalParams.httpData.havingGroupBy`. Encode the JSON object with base64url ' +
        '(URL-safe base64: `-`/`_` instead of `+`/`/`, no `=` padding). ' +
        'Example JSON: `{"column":["status"]}` → base64url `eyJjb2x1bW4iOlsic3RhdHVzIl19`.',
      required: false,
      schema: ENCODED_HTTP_DATA_QUERY_SCHEMA,
      example: 'eyJjb2x1bW4iOlsic3RhdHVzIl19',
    }),
    ApiQuery({
      name: 'uniqueCount',
      description:
        'Optional base64url-encoded non-empty JSON array of Unique Count sources: source alias ' +
        'paths, where an empty string is the Data Mart itself. Each source counts distinct ' +
        'values of its primary key, whatever the key type, and the array holds 1 to ' +
        `${String(UNIQUE_COUNT_CONFIG_MAX_SOURCES)} sources. ` +
        'The output key is `Unique Count` for the Data Mart itself and ' +
        '`<alias path>__unique_count` for a joined source (dots in the path become `_`); a ' +
        '`sort` rule may name that key, as in Reports. Omit `columns` and `column` for a ' +
        'single total row, or pass explicit `column` values to count per group; `columns=*` and ' +
        '`columns=**` are rejected, and so is a `pre-join` filter on a single-total-row read. ' +
        'A source without a primary key, or a joined Data Mart that is not joined, excluded ' +
        'from reporting or not accessible to the caller, is rejected. A Unique Count key cannot ' +
        'be listed in `column` or used in a `filter`, `aggregation` or `dateTrunc` rule. ' +
        'Example JSON: `[""]` → base64url `WyIiXQ`.',
      required: false,
      schema: ENCODED_HTTP_DATA_QUERY_SCHEMA,
      example: 'WyIiXQ',
    }),
    ApiQuery({
      name: 'limit',
      description: 'Optional row cap (positive integer).',
      required: false,
      schema: {
        type: 'integer',
        minimum: 1,
      },
    }),
    ApiQuery({
      name: 'includeTotalRowCount',
      description:
        'Optional. Pass `true` to get the row count of the full result, without `limit`, in ' +
        'the `x-owox-total-row-count` response header. The count costs one more warehouse ' +
        'query. OWOX waits up to 60 s for it before the first row. BigQuery and Snowflake ' +
        'stop the query at that limit. On other storages the query runs to its end. The ' +
        'default is `false`. The run records the count as `additionalParams.httpData.totalRowCount`, or the reason ' +
        'the count is missing as `additionalParams.httpData.totalRowCountError`.',
      required: false,
      enum: ['true', 'false'],
      example: 'true',
    }),
    ApiProduces('application/x-ndjson'),
    ApiOkResponse({
      description:
        'NDJSON stream of row objects. Each line is a complete JSON object whose ' +
        'keys match the requested columns, in the requested order. The response ' +
        'includes the `x-owox-run-id` header with the DataMartRun ID. The run exists when ' +
        'the headers arrive, if OWOX can record it. Its status is `RUNNING` until the stream ' +
        'ends. It holds the SQL and the totals when OWOX can produce them.',
      headers: {
        'x-owox-run-id': {
          description:
            'ID of the DataMartRun (HTTP_DATA). The run exists when the headers arrive, if OWOX can record it. Its status is RUNNING until the stream ends.',
          schema: { type: 'string' },
        },
        'x-owox-total-row-count': {
          description:
            'Row count of the full result, without `limit`, as digits. Set only when the read ' +
            'passes `includeTotalRowCount=true` and the count finishes. It is absent when the ' +
            'read does not ask, the count fails, or it takes longer than 60 s.',
          schema: { type: 'string', pattern: '^[0-9]+$' },
        },
      },
      content: {
        'application/x-ndjson': {
          schema: {
            type: 'string',
            example:
              '{"date":"2026-05-01","revenue":42.5}\n' + '{"date":"2026-05-02","revenue":51.0}\n',
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description:
        'Invalid request: unknown column (including in an aggregation, dateTrunc or ' +
        'havingGroupBy rule), ' +
        'forbidden pagination parameter (`pageToken`/`offset`), malformed ' +
        'filter/sort/aggregation/dateTrunc/havingGroupBy/uniqueCount/limit, an `includeTotalRowCount` value other than `true` or `false`, aggregation or dateTrunc without an ' +
        'explicit `column` projection, an empty uniqueCount, uniqueCount with ' +
        '`columns=*`/`columns=**`, a Unique Count source without a primary key or not available ' +
        'for reporting, a Unique Count key in `column`/filter/aggregation/dateTrunc/havingGroupBy, ' +
        'havingGroupBy without a metric filter (`HAVING_GROUP_BY_REQUIRES_METRIC_FILTER`) or ' +
        'with a key that cannot be grouped (`HAVING_GROUP_BY_KEY_NOT_GROUPABLE`), an ' +
        'aggregate-level Calculated Field key (`CALCULATED_FIELD_AS_DIMENSION`) or an invalid ' +
        'date bucket (`DATE_TRUNC_*`), ' +
        'unsupported storage type, ' +
        'or a project blocked because it is ' +
        'inactive or has exceeded its credit limit. Invalid query parameters create no run. ' +
        'Errors in saved Data Mart configuration create a FAILED run. Project blocks create ' +
        'RESTRICTED runs. No 400 response carries an `x-owox-run-id` header.',
    }),
    ApiResponse({
      status: 403,
      description: 'Caller is authenticated but lacks `Action.USE` on the requested Data Mart.',
    }),
    ApiResponse({
      status: 404,
      description: 'Data Mart not visible in the caller’s project, or not published.',
    }),
    ApiResponse({
      status: 424,
      description:
        'Storage dependency failed while preparing or reading Data Mart data. ' +
        'The response includes provider context such as storage type, provider message, ' +
        'provider status code, and provider reason when available.',
    }),
    ApiResponse({
      status: 503,
      description: 'The server is shutting down and cannot start a new HTTP Data stream.',
    })
  );
}

export function StreamHttpReportDataSpec() {
  return applyDecorators(
    ApiOperation({
      summary: "Stream an existing report's data as NDJSON",
      description:
        'Streams rows of a saved report as newline-delimited JSON (one data row per line, no ' +
        'envelope), applying the report’s stored output controls (columns, filters, aggregations, ' +
        'date buckets, unique count, sort). The only accepted query parameter is an optional ' +
        '`limit` override; any other query key is rejected. Authenticated with the ODM member ' +
        'token via `x-owox-authorization`. Successful executions and execution failures, including ' +
        'invalid saved output controls, create a DataMartRun tagged with the reportId. ' +
        'Invalid request query parameters create no run. ' +
        'The run also records the executed SQL under ' +
        '`additionalParams.httpData.executionSqlQuery` when OWOX can build it.',
    }),
    ApiHeader({ name: 'x-owox-authorization', description: 'ODM member token', required: true }),
    ApiParam({ name: 'reportId', description: 'Report identifier (UUID)' }),
    ApiQuery({
      name: 'limit',
      description: "Optional row cap (positive integer) overriding the report's saved limit.",
      required: false,
      type: Number,
    }),
    ApiProduces('application/x-ndjson'),
    ApiOkResponse({
      description:
        'NDJSON stream of the report’s row objects. The response includes the `x-owox-run-id` ' +
        'header with the DataMartRun ID. The run exists when the headers arrive, if OWOX can ' +
        'record it. Its status is `RUNNING` until the stream ends. It holds the SQL and the ' +
        'totals when OWOX can produce them.',
      headers: {
        'x-owox-run-id': {
          description:
            'ID of the DataMartRun. The run exists when the headers arrive, if OWOX can record it. Its status is RUNNING until the stream ends.',
          schema: { type: 'string' },
        },
      },
      content: {
        'application/x-ndjson': {
          schema: {
            type: 'string',
            example:
              '{"date":"2026-05-01","revenue":42.5}\n' + '{"date":"2026-05-02","revenue":51.0}\n',
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description:
        'An unsupported query parameter or invalid `limit` creates no run. Saved report output ' +
        'controls rejected during validation create a FAILED run. Storage rejections return ' +
        '424. Project restrictions create a RESTRICTED run. No 400 response carries an ' +
        '`x-owox-run-id` header.',
    }),
    ApiResponse({ status: 401, description: 'Missing or invalid `x-owox-authorization` token.' }),
    ApiResponse({
      status: 403,
      description: 'Caller is authenticated but lacks `Action.USE` on the report’s Data Mart.',
    }),
    ApiResponse({
      status: 404,
      description: 'Report not found in the caller’s project, or its Data Mart is not published.',
    }),
    ApiResponse({
      status: 424,
      description:
        'Storage dependency failed while preparing or reading the report data. A FAILED run ' +
        'is recorded, including when storage rejects saved report configuration.',
    })
  );
}
