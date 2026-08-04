import { NotFoundException, BadRequestException } from '@nestjs/common';
import { QueryDataMartTool } from './query-data-mart.tool';
import {
  UnsupportedOperatorError,
  UnsupportedAggregationError,
  UnsupportedDateBucketError,
} from './query-data-mart.input';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { ProjectBlockedReason } from '../../../data-marts/enums/project-blocked-reason.enum';
import {
  QueryAbortedError,
  QueryTimeoutError,
} from '../../../data-marts/facades/mcp-data-marts.facade';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
import { ROWS_PAYLOAD_BYTE_CAP } from './tabular-serializer';

const AUTH_CTX = {
  projectId: 'p1',
  userId: 'u1',
  roles: ['admin'] as string[],
};

describe('QueryDataMartTool', () => {
  const facade = { queryDataMart: jest.fn(), listDataMarts: jest.fn() };
  const cls = { update: jest.fn(), get: jest.fn(), set: jest.fn(), runWithContext: jest.fn() };
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
  } as unknown as jest.Mocked<PublicOriginService>;
  const tool = new QueryDataMartTool(facade as never, cls as never, publicOrigin);

  beforeEach(() => jest.clearAllMocks());

  it('exposes the MCP contract', () => {
    expect(tool.name).toBe('query_data_mart');
    expect(tool.requiredScopes).toEqual(['mcp:read', 'mcp:write']);
    expect(tool.annotations).toMatchObject({ title: 'Query Data Mart', openWorldHint: false });
  });

  it('embeds the generated field-type matrix in the description', () => {
    // One line per category, generated from the validator's own constants.
    expect(tool.description).toContain('- number (');
    expect(tool.description).toContain('- string (');
    expect(tool.description).toContain('- date (');
    expect(tool.description).toContain('- boolean (');
    expect(tool.description).toContain('- other (');
    // The two footguns the matrix exists to prevent.
    expect(tool.description).toContain('only where enabled on the field');
    expect(tool.description).toContain('NOT available on number fields');
  });

  it('rejects input missing required fields', () => {
    expect(() => tool['parseInput']({ data_mart_id: 'dm1' })).toThrow();
  });

  describe('success path', () => {
    it('returns returned_rows from serializer and truncated from facade when cap is not hit', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['name', 'value'],
        columnMetadata: [
          { name: 'name', displayName: 'Customer name' },
          { name: 'value', displayName: 'Revenue' },
        ],
        rows: [
          ['alpha', '1'],
          ['beta', '2'],
        ],
        returnedRows: 2,
        truncated: false,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
      });

      const result = await tool.handler(
        { data_mart_id: 'dm1', fields: ['name', 'value'] },
        AUTH_CTX as never
      );

      expect(result.isError).toBeFalsy();
      const sc = result.structuredContent as {
        columns: string[];
        rows: string;
        returned_rows: number;
        truncated: boolean;
        totals: null;
      };
      expect(sc.returned_rows).toBe(2);
      expect(sc.truncated).toBe(false);
      expect(sc.columns).toEqual(['Customer name', 'Revenue']);
      expect(sc.rows.split('\n')[0]).toBe(sc.columns.join('\t'));
      expect(result.structuredContent).toMatchObject({
        column_metadata: [
          { name: 'name', display_name: 'Customer name' },
          { name: 'value', display_name: 'Revenue' },
        ],
        source: {
          data_mart: {
            id: 'dm1',
            title: 'Orders',
            url: 'https://app.owox.com/ui/p1/data-marts/dm1/data-setup',
          },
        },
        calculation_origin: { rows: 'taken_from_owox', totals: 'not_available' },
      });
    });

    it('keeps result headers non-empty, unique, and TSV-safe when aliases are malformed', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['created_at', 'updated_at', 'event_date', 'notes'],
        columnMetadata: [
          { name: 'created_at', displayName: '  ' },
          { name: 'updated_at', displayName: 'Date' },
          { name: 'event_date', displayName: 'Date' },
          { name: 'notes', displayName: 'Notes\tand\ncomments' },
        ],
        rows: [['2026-01-01', '2026-01-02', '2026-01-03', 'hello']],
        truncated: false,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
      });

      const result = await tool.handler(
        { data_mart_id: 'dm1', fields: ['created_at', 'updated_at', 'event_date', 'notes'] },
        AUTH_CTX as never
      );

      const structuredContent = result.structuredContent as {
        columns: string[];
        column_metadata: Array<{ name: string; display_name: string }>;
        rows: string;
      };
      expect(structuredContent.columns).toEqual([
        'created_at',
        'Date (updated_at)',
        'Date (event_date)',
        'Notes\\tand\\ncomments',
      ]);
      expect(structuredContent.rows.split('\n')[0]).toBe(structuredContent.columns.join('\t'));
      expect(structuredContent.column_metadata).toEqual([
        { name: 'created_at', display_name: 'created_at' },
        { name: 'updated_at', display_name: 'Date (updated_at)' },
        { name: 'event_date', display_name: 'Date (event_date)' },
        { name: 'notes', display_name: 'Notes\\tand\\ncomments' },
      ]);
    });

    it('explains how technical totals keys map to display columns', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['revenue | SUM'],
        columnMetadata: [{ name: 'revenue | SUM', displayName: 'Revenue' }],
        rows: [['42']],
        truncated: false,
        totals: { 'revenue | SUM': 42 },
        dataMart: { id: 'dm1', title: 'Orders' },
      });

      const result = await tool.handler(
        { data_mart_id: 'dm1', fields: ['revenue'] },
        AUTH_CTX as never
      );

      expect(result.structuredContent).toMatchObject({
        columns: ['Revenue'],
        column_metadata: [{ name: 'revenue | SUM', display_name: 'Revenue' }],
        totals: { 'revenue | SUM': 42 },
      });
      expect((result.structuredContent as { _instruction: string })._instruction).toContain(
        'column_metadata[].name'
      );
    });

    describe('data_last_updated', () => {
      const baseResponse = {
        columns: ['revenue'],
        columnMetadata: [{ name: 'revenue', displayName: 'Revenue' }],
        rows: [['42']],
        truncated: false,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
      };

      const callTool = () =>
        tool.handler({ data_mart_id: 'dm1', fields: ['revenue'] }, AUTH_CTX as never);

      it('serialises the measured block and marks it as measured by OWOX', async () => {
        facade.queryDataMart.mockResolvedValue({
          ...baseResponse,
          dataLastUpdated: {
            dataLastUpdatedAt: '2026-07-25T08:30:00.000Z',
            computedAt: '2026-07-28T00:00:00.000Z',
            coverage: 'complete',
            sources: [
              { table: 'my-project.ds.orders', dataLastUpdatedAt: '2026-07-25T08:30:00.000Z' },
            ],
          },
        });

        const result = await callTool();

        expect(result.structuredContent).toMatchObject({
          data_last_updated: {
            data_last_updated_at: '2026-07-25T08:30:00.000Z',
            computed_at: '2026-07-28T00:00:00.000Z',
            coverage: 'complete',
            sources: [
              {
                table: 'my-project.ds.orders',
                data_last_updated_at: '2026-07-25T08:30:00.000Z',
              },
            ],
          },
          calculation_origin: { data_last_updated: 'measured_by_owox' },
        });
      });

      it('tells the model to attribute the time to the source tables, not to the data', async () => {
        facade.queryDataMart.mockResolvedValue({
          ...baseResponse,
          dataLastUpdated: {
            dataLastUpdatedAt: '2026-07-25T08:30:00.000Z',
            computedAt: '2026-07-28T00:00:00.000Z',
            coverage: 'complete',
            sources: [],
          },
        });

        const instruction = (await callTool()).structuredContent as { _instruction: string };

        expect(instruction._instruction).toContain('SOURCE TABLES');
        expect(instruction._instruction).toContain('2026-07-25T08:30:00.000Z');
      });

      it('flags partial coverage as a lower bound', async () => {
        facade.queryDataMart.mockResolvedValue({
          ...baseResponse,
          dataLastUpdated: {
            dataLastUpdatedAt: '2026-07-25T08:30:00.000Z',
            computedAt: '2026-07-28T00:00:00.000Z',
            coverage: 'partial',
            sources: [
              {
                table: 'my-project.ds.sheet_feed',
                dataLastUpdatedAt: null,
                note: 'external table — data lives outside BigQuery, modification time not tracked',
              },
            ],
          },
        });

        const result = await callTool();
        const sc = result.structuredContent as {
          _instruction: string;
          data_last_updated: { sources: { note?: string }[] };
        };

        expect(sc._instruction).toContain('at least as recent as');
        expect(sc.data_last_updated.sources[0].note).toContain('external table');
      });

      it('tells the model to say "not determined" rather than imply freshness when unknown', async () => {
        facade.queryDataMart.mockResolvedValue({
          ...baseResponse,
          dataLastUpdated: {
            dataLastUpdatedAt: null,
            computedAt: '2026-07-28T00:00:00.000Z',
            coverage: 'unavailable',
            sources: [],
          },
        });

        const result = await callTool();
        const sc = result.structuredContent as {
          _instruction: string;
          calculation_origin: { data_last_updated: string };
        };

        expect(sc.calculation_origin.data_last_updated).toBe('not_available');
        expect(sc._instruction).toContain('could not determine it');
      });

      it('still answers when the block is missing entirely — it must never fail a paid query', async () => {
        facade.queryDataMart.mockResolvedValue(baseResponse);

        const result = await callTool();

        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({
          data_last_updated: { data_last_updated_at: null, coverage: 'unavailable' },
          calculation_origin: { data_last_updated: 'not_available' },
        });
      });
    });

    it('sets truncated: true when the facade signals truncation', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['id'],
        columnMetadata: [{ name: 'id', displayName: 'Order ID' }],
        rows: [['1'], ['2'], ['3']],
        returnedRows: 3,
        truncated: true,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
      });

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['id'] }, AUTH_CTX as never);

      expect(result.isError).toBeFalsy();
      const sc = result.structuredContent as {
        truncated: boolean;
        truncation?: { reasons: string[] };
        _instruction: string;
      };
      expect(sc.truncated).toBe(true);
      expect(sc.truncation).toEqual({ reasons: ['row_limit'] });
      expect(sc._instruction).toContain('Rows are incomplete');
    });

    it('reports the payload byte cap separately from a row-limit truncation', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['notes'],
        columnMetadata: [{ name: 'notes', displayName: 'Notes' }],
        rows: [['x'.repeat(ROWS_PAYLOAD_BYTE_CAP)]],
        truncated: false,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
      });

      const result = await tool.handler(
        { data_mart_id: 'dm1', fields: ['notes'] },
        AUTH_CTX as never
      );

      expect(result.structuredContent).toMatchObject({
        returned_rows: 0,
        truncated: true,
        truncation: { reasons: ['payload_byte_cap'] },
      });
    });

    it('maps sort rules to the facade sortConfig (field → column)', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['date', 'revenue'],
        columnMetadata: [
          { name: 'date', displayName: 'Order date' },
          { name: 'revenue', displayName: 'Revenue' },
        ],
        rows: [['2026-05-01', '10']],
        truncated: false,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
      });

      await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['date', 'revenue'],
          sort: [{ field: 'revenue', direction: 'desc' }],
        },
        AUTH_CTX as never
      );

      expect(facade.queryDataMart).toHaveBeenCalledTimes(1);
      expect(facade.queryDataMart.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          sortConfig: [{ column: 'revenue', direction: 'desc' }],
        })
      );
    });

    it('forwards the request AbortSignal to the facade', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['id'],
        columnMetadata: [{ name: 'id', displayName: 'Order ID' }],
        rows: [['1']],
        truncated: false,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
      });
      const controller = new AbortController();

      await tool.handler(
        { data_mart_id: 'dm1', fields: ['id'] },
        AUTH_CTX as never,
        controller.signal
      );

      expect(facade.queryDataMart).toHaveBeenCalledTimes(1);
      expect(facade.queryDataMart.mock.calls[0][1]).toBe(controller.signal);
    });

    it('writes executed SQL into MCP tool diagnostics (CLS)', async () => {
      cls.update.mockClear();
      facade.queryDataMart.mockResolvedValue({
        columns: ['id'],
        columnMetadata: [{ name: 'id', displayName: 'Order ID' }],
        rows: [['1']],
        truncated: false,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
        executedSql: 'SELECT id FROM t',
      });
      await tool.handler({ data_mart_id: 'dm1', fields: ['id'] }, AUTH_CTX as never);
      expect(cls.update).toHaveBeenCalledWith('McpToolDiagnostics', {
        executedSql: 'SELECT id FROM t',
      });
    });
  });

  describe('error mapping', () => {
    it('maps QueryTimeoutError → query_timeout (actionable, mentions not billed)', async () => {
      facade.queryDataMart.mockRejectedValue(new QueryTimeoutError(30000));

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'query_timeout' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toMatch(/not billed/i);
      expect(msg).toMatch(/fewer fields|limit|aggregate|filter/i);
    });

    it('maps QueryAbortedError → query_cancelled', async () => {
      facade.queryDataMart.mockRejectedValue(new QueryAbortedError());

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'query_cancelled' });
    });

    it('maps NotFoundException → permission_denied without leaking the exception message', async () => {
      facade.queryDataMart.mockRejectedValue(
        new NotFoundException('Data Mart with id dm1 and projectId p1 not found')
      );

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'permission_denied' });
      expect(result.content?.[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('permission_denied'),
      });
      // The raw exception embeds the id/projectId — the tool must return a static message, not forward it.
      expect(JSON.stringify(result)).not.toContain('projectId p1');
    });

    it('maps UnsupportedOperatorError → unsupported_operator (defensive path — every current operator maps)', async () => {
      // No enum operator triggers this today; keep the mapping honest for a future
      // operator that ships in the schema ahead of its internal support.
      facade.queryDataMart.mockRejectedValue(new UnsupportedOperatorError('future_op'));

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'unsupported_operator' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain("'future_op'");
      expect(msg).toContain('Supported operators:');
    });

    it('passes the calendar presets through to the facade as relative_date rules', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['d'],
        columnMetadata: [{ name: 'd', displayName: 'Date' }],
        rows: [['2026-07-20']],
        returnedRows: 1,
        truncated: false,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
      });

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['d'],
          filters: [
            { field: 'd', operator: 'this_week' },
            { field: 'd', operator: 'in_next_n_days', value: 7 },
          ],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBeFalsy();
      expect(facade.queryDataMart.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          filterConfig: [
            {
              column: 'd',
              operator: 'relative_date',
              value: { kind: 'this_week' },
              placement: 'post-join',
            },
            {
              column: 'd',
              operator: 'relative_date',
              value: { kind: 'next_n_days', n: 7 },
              placement: 'post-join',
            },
          ],
        })
      );
    });

    it('invalid aggregation function fails at schema parse (ZodError) → invalid_input', async () => {
      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['f1'],
          aggregations: [{ field: 'f1', function: 'BOGUS_FN' as never }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_input' });
      expect((result.structuredContent as { message?: string }).message).toContain('BOGUS_FN');
    });

    it('invalid date bucket unit fails at schema parse (ZodError) → invalid_input', async () => {
      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['order_date'],
          date_buckets: [{ field: 'order_date', unit: 'DECADE' as never }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_input' });
      expect((result.structuredContent as { message?: string }).message).toContain('DECADE');
    });

    it('missing required data_mart_id (ZodError) → invalid_input', async () => {
      const result = await tool.handler({ fields: ['f1'] } as never, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_input' });
    });

    it('surfaces UnsupportedDateBucketError via instanceof (not error.name)', () => {
      const err = new UnsupportedDateBucketError('DECADE');
      expect(err instanceof UnsupportedDateBucketError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });

    it('maps BusinessViolationException with unknownColumns → field_not_found', async () => {
      const err = new BusinessViolationException('Disconnected columns: "ghost_field"', {
        unknownColumns: ['ghost_field'],
        dataMartId: 'dm1',
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        { data_mart_id: 'dm1', fields: ['ghost_field'] },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'field_not_found' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain('ghost_field');
      expect(msg).toContain('get_data_mart_details_by_id');
      const c0 = result.content![0] as { type: string; text: string };
      expect(JSON.parse(c0.text)).toMatchObject({
        error_code: 'field_not_found',
      });
    });

    it('maps BusinessViolationException with reservedNameColumns → field_name_reserved, without the raw message', async () => {
      const err = new BusinessViolationException(
        "buildValueSleeveGroupCte: dimension column(s) [_val] collide with a reserved internal alias ('_oid', '_val', '_dedup') of the sleeve 'sleeve_orders_hitId' computing [SUM(revenue)] — rename the field/output alias",
        { reservedNameColumns: ['_val'] }
      );
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        { data_mart_id: 'dm1', fields: ['_val', 'revenue'] },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'field_name_reserved' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      // Unnameable = unfixable: the caller can only act if the offending field is named.
      expect(msg).toContain('_val');
      expect(msg).toMatch(/rename/i);
      // The field exists — a schema re-fetch would just loop the model.
      expect(msg).toContain('do not re-fetch the schema');
      const text = (result.content?.[0] as { text: string }).text;
      expect(text).not.toContain('buildValueSleeveGroupCte');
      expect(text).not.toContain('sleeve_orders_hitId');
      expect(text).not.toContain('SUM(revenue)');
    });

    it('maps BadRequestException with FILTER_COLUMN_UNKNOWN → field_not_found', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: { errors: [{ code: 'FILTER_COLUMN_UNKNOWN', column: 'bad_col' }] },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'field_not_found' });
    });

    it('maps INVALID_OPERATOR_FOR_TYPE → invalid_operator listing the operators that fit', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            {
              code: 'INVALID_OPERATOR_FOR_TYPE',
              column: 'revenue',
              type: 'FLOAT',
              operator: 'contains',
            },
          ],
        },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['revenue'],
          filters: [{ field: 'revenue', operator: 'contains', value: '1' }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_operator' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain("'contains'");
      expect(msg).toContain("'revenue'");
      expect(msg).toContain('FLOAT');
      // Lists the operators a number field DOES accept…
      expect(msg).toContain('between');
      expect(msg).toContain('gte');
      // …and steers away from a schema re-fetch loop.
      expect(msg).toContain('do not re-fetch the schema');
      expect(msg).not.toContain('contains, ');
    });

    it('reports ALL validation-error families in one response (no round-trip per class)', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            {
              code: 'INVALID_OPERATOR_FOR_TYPE',
              column: 'revenue',
              type: 'FLOAT',
              operator: 'contains',
            },
            { code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD', column: 'name', function: 'SUM' },
            { code: 'SORT_COLUMN_NOT_SELECTED', column: 'ts' },
          ],
        },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        { data_mart_id: 'dm1', fields: ['revenue'] },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      // error_code = highest-priority family (shared-mapper order), message carries every family.
      expect(result.structuredContent).toMatchObject({ error_code: 'field_not_selected' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain("'contains'");
      expect(msg).toContain('SUM(name)');
      expect(msg).toContain('missing from "fields"');
      expect(msg).toContain('ts');
    });

    it('translates internal relative_date back to the MCP preset names in the error', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            {
              code: 'INVALID_OPERATOR_FOR_TYPE',
              column: 'session_time',
              type: 'TIME',
              operator: 'relative_date',
            },
          ],
        },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['session_time'],
          filters: [{ field: 'session_time', operator: 'this_week' }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_operator' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      // The caller's vocabulary, not the internal operator name.
      expect(msg).not.toContain("'relative_date'");
      expect(msg).toContain('this_week');
      expect(msg).toContain('in_last_n_days');
      expect(msg).toContain("'session_time'");
    });

    it('explains a boolean VALUE on a non-boolean field instead of naming is_true', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            {
              code: 'INVALID_OPERATOR_FOR_TYPE',
              column: 'utm_source',
              type: 'STRING',
              operator: 'is_true',
            },
          ],
        },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['utm_source'],
          filters: [{ field: 'utm_source', operator: 'eq', value: true }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      // Points at the VALUE (the real problem), not at an operator the caller never sent.
      expect(msg).toContain('boolean true/false value');
      expect(msg).toContain("'utm_source'");
      expect(msg).not.toContain("operator 'is_true'");
    });

    it('maps boolean eq with a non-boolean value → value guidance, not an operator list', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            {
              code: 'INVALID_OPERATOR_FOR_TYPE',
              column: 'active',
              type: 'BOOLEAN',
              operator: 'eq',
            },
          ],
        },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['active'],
          filters: [{ field: 'active', operator: 'eq', value: 'true' }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_operator' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain("'active'");
      expect(msg).toContain('boolean true or false');
    });

    it('maps DATE_TRUNC_REQUIRES_DATE_COLUMN and TIMEZONE_REQUIRES_TIMESTAMP → invalid_date_bucket', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            { code: 'DATE_TRUNC_REQUIRES_DATE_COLUMN', column: 'channel', type: 'STRING' },
            { code: 'DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP', column: 'day', type: 'DATE' },
          ],
        },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['channel', 'day'],
          date_buckets: [
            { field: 'channel', unit: 'MONTH' },
            { field: 'day', unit: 'DAY', time_zone: 'Europe/Kyiv' },
          ],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_date_bucket' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain("'channel'");
      expect(msg).toContain('not a date/timestamp');
      expect(msg).toContain("'day'");
      expect(msg).toContain('remove time_zone');
      expect(msg).toContain('do not re-fetch the schema');
    });

    it('maps DATE_TRUNC_INVALID_TIMEZONE and COLUMN_IS_AGGREGATED → invalid_date_bucket', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            { code: 'DATE_TRUNC_INVALID_TIMEZONE', column: 'ts', timeZone: 'Kyiv' },
            { code: 'DATE_TRUNC_COLUMN_IS_AGGREGATED', column: 'ts2' },
          ],
        },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        { data_mart_id: 'dm1', fields: ['ts', 'ts2'] },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_date_bucket' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain("'Kyiv' is not a valid IANA time zone");
      expect(msg).toContain('both aggregated and date-bucketed');
    });

    it('passes an in filter through to the facade (natively supported)', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['channel'],
        columnMetadata: [{ name: 'channel', displayName: 'Channel' }],
        rows: [['fb']],
        returnedRows: 1,
        truncated: false,
        totals: null,
        dataMart: { id: 'dm1', title: 'Orders' },
      });

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['channel'],
          filters: [{ field: 'channel', operator: 'in', value: ['fb', 'google'] }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBeFalsy();
      expect(facade.queryDataMart.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          filterConfig: [
            { column: 'channel', operator: 'in', value: ['fb', 'google'], placement: 'post-join' },
          ],
        })
      );
    });

    it('rejects an in filter with an empty array via a clear invalid_input-style error', async () => {
      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['channel'],
          filters: [{ field: 'channel', operator: 'in', value: [] }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain('non-empty array');
    });

    it('maps PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART → slices_not_applicable (move to filters)', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: { errors: [{ code: 'PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART' }] },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['channel'],
          slices: [{ field: 'channel', operator: 'eq', value: 'fb' }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'slices_not_applicable' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain('filters');
    });

    it('rejects an aggregation function not advertised by the tool (STRING_AGG) at schema parse → invalid_input', async () => {
      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['name'],
          aggregations: [{ field: 'name', function: 'STRING_AGG' as never }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_input' });
      expect((result.structuredContent as { message?: string }).message).toContain('STRING_AGG');
    });

    it('maps AGGREGATION_COLUMN_NOT_SELECTED → field_not_selected (structural, names the column, no schema re-fetch)', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: { errors: [{ code: 'AGGREGATION_COLUMN_NOT_SELECTED', column: 'revenue' }] },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['ts'],
          aggregations: [{ field: 'revenue', function: 'SUM' }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'field_not_selected' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain('revenue');
      expect(msg).toContain('"fields"');
      expect(msg).not.toContain('get_data_mart_details_by_id');
    });

    it('maps DATE_TRUNC_COLUMN_NOT_SELECTED → field_not_selected (bucket field not in fields)', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: { errors: [{ code: 'DATE_TRUNC_COLUMN_NOT_SELECTED', column: 'ts' }] },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['revenue'],
          date_buckets: [{ field: 'ts', unit: 'MONTH' }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'field_not_selected' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain('ts');
    });

    it('maps INVALID_OPERATOR_FOR_TYPE on a slice → invalid_operator with pre-join guidance', async () => {
      // A slice runs pre-join, so the validator checks the operator against the field's RAW type
      // (STRING here) and carries an aliasPath. The tool must point the model at `sliceType`.
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            {
              code: 'INVALID_OPERATOR_FOR_TYPE',
              column: 'ga__campaign_name',
              type: 'STRING',
              operator: 'gt',
              aliasPath: 'ga',
            },
          ],
        },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['ga__campaign_name'],
          slices: [{ field: 'ga__campaign_name', operator: 'gt', value: 1 }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'invalid_operator' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain('ga__campaign_name');
      expect(msg).toMatch(/sliceType|pre-join/i);
    });

    it('maps ProjectOperationBlockedException (BI_PROJECT_NOT_ACTIVE) → project_inactive', async () => {
      facade.queryDataMart.mockRejectedValue(
        new ProjectOperationBlockedException([ProjectBlockedReason.BI_PROJECT_NOT_ACTIVE])
      );

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'project_inactive' });
    });

    it('maps ProjectOperationBlockedException (OVERDRAFT_LIMIT_EXCEEDED) → insufficient_credits', async () => {
      facade.queryDataMart.mockRejectedValue(
        new ProjectOperationBlockedException([ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED])
      );

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'insufficient_credits' });
    });

    it('prioritizes insufficient_credits over project_inactive when both reasons are present', async () => {
      facade.queryDataMart.mockRejectedValue(
        new ProjectOperationBlockedException([
          ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED,
          ProjectBlockedReason.BI_PROJECT_NOT_ACTIVE,
        ])
      );

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'insufficient_credits' });
    });

    it('routes unknown errors to a sanitized query_failed — never forwards the raw message', async () => {
      facade.queryDataMart.mockRejectedValue(
        new Error('Syntax error near SELECT revenue FROM `secret_project.dataset` at [1:42]')
      );

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'query_failed' });
      const text = (result.content?.[0] as { text: string }).text;
      expect(text).not.toContain('secret_project');
      expect(text).not.toContain('SELECT revenue');
    });

    it('maps source-access BusinessViolationException → permission_denied without leaking titles/identity', async () => {
      const err = new BusinessViolationException(
        'Cannot build report SQL, user "Jane Doe <jane@corp.com>" is missing access to data marts: "Restricted Revenue"',
        { userId: 'u1', deniedDataMartIds: ['dm9'], deniedAliasPaths: ['orders'] }
      );
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['f1'] }, AUTH_CTX as never);

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'permission_denied' });
      const text = (result.content?.[0] as { text: string }).text;
      expect(text).not.toContain('Restricted Revenue');
      expect(text).not.toContain('jane@corp.com');
      expect(text).not.toContain('Jane Doe');
    });

    it('maps AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD → aggregation_not_allowed (names field+function, no schema re-fetch)', async () => {
      const err = new BadRequestException({
        message: 'Output controls validation failed',
        details: {
          errors: [
            {
              code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD',
              column: 'revenue',
              function: 'P95',
            },
          ],
        },
      });
      facade.queryDataMart.mockRejectedValue(err);

      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['revenue'],
          aggregations: [{ field: 'revenue', function: 'P95' }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'aggregation_not_allowed' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain('P95(revenue)');
      expect(msg).not.toContain('get_data_mart_details_by_id');
    });

    it('surfaces UnsupportedOperatorError via instanceof (not error.name)', () => {
      const err = new UnsupportedOperatorError('in');
      expect(err instanceof UnsupportedOperatorError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });

    it('surfaces UnsupportedAggregationError via instanceof (not error.name)', () => {
      const err = new UnsupportedAggregationError('BOGUS');
      expect(err instanceof UnsupportedAggregationError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });
  });
});
