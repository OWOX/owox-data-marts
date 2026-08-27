import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';
import {
  ADVERTISED_MCP_OPERATORS,
  LEGACY_MCP_OPERATORS,
  makeMcpFilterSchema,
  queryDataMartInputSchema,
} from './query-data-mart.input';
import { addReportInputSchema } from './add-report.tool';
import { updateReportInputSchema } from './update-report.tool';

/**
 * JSON-Schema advertising contract (#6779): the machine-readable input schema the
 * MCP tools publish must advertise ONLY the blank pair for the null/empty cluster —
 * the legacy names stay accepted at parse time but must not appear anywhere in the
 * serialized contract of query_data_mart, add_report, or update_report.
 */
describe('MCP operator advertising contract', () => {
  // Every operator enum in a generated schema is recognizable by containing is_blank.
  function collectOperatorEnums(node: unknown, found: string[][]): string[][] {
    if (Array.isArray(node)) {
      for (const item of node) collectOperatorEnums(item, found);
    } else if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (Array.isArray(record.enum) && record.enum.includes('is_blank')) {
        found.push(record.enum as string[]);
      }
      for (const value of Object.values(record)) collectOperatorEnums(value, found);
    }
    return found;
  }

  const tools: Array<[string, z.ZodTypeAny]> = [
    ['query_data_mart', queryDataMartInputSchema],
    ['add_report', addReportInputSchema],
    ['update_report', updateReportInputSchema],
  ];

  it.each(tools)(
    '%s advertises only the blank pair — no legacy operator names',
    (_name, schema) => {
      const json = zodToJsonSchema(schema);
      const serialized = JSON.stringify(json);

      for (const legacy of LEGACY_MCP_OPERATORS) {
        expect(serialized).not.toContain(`"${legacy}"`);
      }

      const enums = collectOperatorEnums(json, []);
      expect(enums.length).toBeGreaterThan(0);
      for (const values of enums) {
        expect(values).toEqual([...ADVERTISED_MCP_OPERATORS]);
      }
    }
  );

  describe('compatibility parsing (accepted ≠ advertised)', () => {
    const schema = makeMcpFilterSchema();

    it.each([...LEGACY_MCP_OPERATORS])('still parses legacy operator %s unchanged', op => {
      expect(schema.parse({ field: 'country', operator: op })).toEqual({
        field: 'country',
        operator: op,
      });
    });

    it('parses the advertised blank pair', () => {
      expect(schema.parse({ field: 'country', operator: 'is_blank' }).operator).toBe('is_blank');
      expect(schema.parse({ field: 'country', operator: 'is_not_blank' }).operator).toBe(
        'is_not_blank'
      );
    });

    it('rejects an unknown operator with the advertised-operator guidance', () => {
      const result = schema.safeParse({ field: 'country', operator: 'is_missing' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues.map(i => i.message).join(' ');
        expect(message).toContain("'is_missing' is not supported");
        expect(message).toContain('is_blank');
        expect(message).not.toContain('is_empty');
      }
    });

    it('keeps operator required — a missing operator does not slip through the catch', () => {
      const result = schema.safeParse({ field: 'country' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map(i => i.message).join(' ')).toContain('operator is required');
      }
    });
  });
});
