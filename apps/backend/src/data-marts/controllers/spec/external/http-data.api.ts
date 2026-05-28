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
        '(one data row per line, no envelope). The caller must explicitly select ' +
        'columns via the repeated `column` query parameter; row objects use those ' +
        'column names as keys in the requested order. Authenticated with the ODM ' +
        'member token via `x-owox-authorization`. Creates one DataMartRun of type ' +
        'HTTP_DATA per request, available through the run history endpoint.',
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
      name: 'column',
      description:
        'Column to include in the output. Repeat the parameter to select multiple ' +
        'columns; the order of repetition is preserved in row objects.',
      required: true,
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
      description: 'Optional row cap (1..10_000_000).',
      required: false,
      type: Number,
    }),
    ApiProduces('application/x-ndjson'),
    ApiOkResponse({
      description:
        'NDJSON stream of row objects. Each line is a complete JSON object whose ' +
        'keys match the requested columns. Response headers include `x-owox-run-id` ' +
        'with the created DataMartRun ID and `x-owox-columns` with the requested ' +
        'column list as a base64url-encoded JSON array.',
      headers: {
        'x-owox-run-id': {
          description: 'ID of the created DataMartRun (HTTP_DATA) for traceability',
          schema: { type: 'string' },
        },
        'x-owox-columns': {
          description:
            'Requested columns, in row-object order, as a base64url-encoded JSON array ' +
            '(lets clients recover the column list even for an empty result stream)',
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
        'Invalid request: missing or unknown column, duplicate columns, ' +
        'forbidden pagination parameter (`pageToken`/`offset`), malformed filter/sort/limit, ' +
        'or unsupported storage type.',
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
