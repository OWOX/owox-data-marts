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

const AUTH_CTX = {
  projectId: 'p1',
  userId: 'u1',
  roles: ['admin'] as string[],
};

describe('QueryDataMartTool', () => {
  const facade = { queryDataMart: jest.fn(), listDataMarts: jest.fn() };
  const cls = { update: jest.fn(), get: jest.fn(), set: jest.fn(), runWithContext: jest.fn() };
  const tool = new QueryDataMartTool(facade as never, cls as never);

  beforeEach(() => jest.clearAllMocks());

  it('exposes the MCP contract', () => {
    expect(tool.name).toBe('query_data_mart');
    expect(tool.requiredScopes).toEqual(['mcp:read', 'mcp:write']);
    expect(tool.annotations).toMatchObject({ title: 'Query Data Mart', openWorldHint: false });
  });

  it('rejects input missing required fields', () => {
    expect(() => tool['parseInput']({ data_mart_id: 'dm1' })).toThrow();
  });

  describe('success path', () => {
    it('returns returned_rows from serializer and truncated from facade when cap is not hit', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['name', 'value'],
        rows: [
          ['alpha', '1'],
          ['beta', '2'],
        ],
        returnedRows: 2,
        truncated: false,
        totals: null,
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
      expect(sc.columns).toEqual(['name', 'value']);
    });

    it('sets truncated: true when the facade signals truncation', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['id'],
        rows: [['1'], ['2'], ['3']],
        returnedRows: 3,
        truncated: true,
        totals: null,
      });

      const result = await tool.handler({ data_mart_id: 'dm1', fields: ['id'] }, AUTH_CTX as never);

      expect(result.isError).toBeFalsy();
      const sc = result.structuredContent as { truncated: boolean };
      expect(sc.truncated).toBe(true);
    });

    it('forwards the request AbortSignal to the facade', async () => {
      facade.queryDataMart.mockResolvedValue({
        columns: ['id'],
        rows: [['1']],
        truncated: false,
        totals: null,
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
        rows: [['1']],
        truncated: false,
        totals: null,
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

    it('maps UnsupportedOperatorError → unsupported_operator', async () => {
      const result = await tool.handler(
        {
          data_mart_id: 'dm1',
          fields: ['f1'],
          filters: [{ field: 'f1', operator: 'in' as never }],
        },
        AUTH_CTX as never
      );

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ error_code: 'unsupported_operator' });
      const msg = (result.structuredContent as { message?: string }).message ?? '';
      expect(msg).toContain("'in'");
      expect(msg).toContain('eq');
      expect(msg).toContain('Supported operators:');
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
