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

export function StreamHttpDataSpec() {
  return applyDecorators(
    ApiOperation({
      summary: 'Stream Data Mart data as NDJSON',
      description:
        'Streams rows of a published Data Mart as newline-delimited JSON ' +
        '(one data row per line, no envelope). Output selectors use `columns=*` or ' +
        '`columns=**`; exact column names use repeated `column` parameters. Row objects ' +
        'use resolved column names as keys in the requested order. Omit both `columns` ' +
        'and `column`, or pass `columns=*`, for all native columns. Pass `columns=**` ' +
        'for all native plus all reporting-visible blended columns. Authenticated ' +
        'with the ODM member token via `x-owox-authorization`. Creates one DataMartRun ' +
        'of type HTTP_DATA per request, available through the run history endpoint.',
    }),
    ApiHeader({
      name: 'x-owox-authorization',
      description: 'ODM member token',
      required: true,
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
        '`column` to select all current Data Mart output columns.',
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
        'Overlaps are de-duplicated.',
      required: false,
      isArray: true,
      type: String,
      example: ['date', 'revenue'],
    }),
    ApiQuery({
      name: 'filter',
      description:
        'Optional base64url-encoded JSON matching the `FilterConfig` schema (same shape as Reports), ' +
        'applied server-side before streaming. Encode the JSON array with base64url ' +
        '(URL-safe base64: `-`/`_` instead of `+`/`/`, no `=` padding) so it survives the query string. ' +
        'Example JSON: `[{"column":"date","operator":"gte","value":"2026-01-01"}]` → ' +
        'base64url `W3siY29sdW1uIjoiZGF0ZSIsIm9wZXJhdG9yIjoiZ3RlIiwidmFsdWUiOiIyMDI2LTAxLTAxIn1d`.',
      required: false,
      type: String,
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
      type: String,
      example: 'W3siY29sdW1uIjoiZGF0ZSIsImRpcmVjdGlvbiI6ImRlc2MifV0',
    }),
    ApiQuery({
      name: 'limit',
      description: 'Optional row cap (positive integer).',
      required: false,
      type: Number,
    }),
    ApiProduces('application/x-ndjson'),
    ApiOkResponse({
      description:
        'NDJSON stream of row objects. Each line is a complete JSON object whose ' +
        'keys match the requested columns, in the requested order. The response ' +
        'includes the `x-owox-run-id` header with the created DataMartRun ID.',
      headers: {
        'x-owox-run-id': {
          description: 'ID of the created DataMartRun (HTTP_DATA) for traceability',
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
        'Invalid request: unknown column, forbidden pagination parameter ' +
        '(`pageToken`/`offset`), malformed filter/sort/limit, or unsupported storage type.',
    }),
    ApiResponse({ status: 401, description: 'Missing or invalid `x-owox-authorization` token.' }),
    ApiResponse({
      status: 403,
      description: 'Caller is authenticated but lacks `Action.USE` on the requested Data Mart.',
    }),
    ApiResponse({
      status: 404,
      description: 'Data Mart not visible in the caller’s project, or not published.',
    })
  );
}
