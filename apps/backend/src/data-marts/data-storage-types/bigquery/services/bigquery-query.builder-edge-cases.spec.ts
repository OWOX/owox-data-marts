/**
 * Edge-case tests for BigQueryQueryBuilder (simple / non-blended path).
 *
 * Fills gaps not covered by bigquery-query.builder.spec.ts:
 *   Test 6 — default 'p' paramPrefix (no leakage from blended s_ prefix)
 *   Test 7 — same context produces byte-identical SQL (simple path)
 *   Test 8 — filters + sort + limit on a view definition (full-combo)
 *   Test 9 — negative LIMIT throws at the renderer level
 *
 * No DB beyond the NestJS test module — pure unit exercising the codegen path.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BigQueryQueryBuilder } from './bigquery-query.builder';
import { BigQueryClauseRenderer } from './bigquery-clause-renderer';
import { isQueryBuildResult } from '../../interfaces/data-mart-query-builder.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';

// ---------------------------------------------------------------------------
// Definition helpers (mirrored from bigquery-query.builder.spec.ts pattern)
// ---------------------------------------------------------------------------

function tableDefinition(fqn: string): DataMartDefinition {
  return { type: 'table', fullyQualifiedName: fqn } as unknown as DataMartDefinition;
}

function viewDefinition(fqn: string): DataMartDefinition {
  return { fullyQualifiedName: fqn } as unknown as DataMartDefinition;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BigQueryQueryBuilder — simple-path edge cases', () => {
  let builder: BigQueryQueryBuilder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BigQueryQueryBuilder, BigQueryClauseRenderer],
    }).compile();

    builder = module.get(BigQueryQueryBuilder);
  });

  // -------------------------------------------------------------------------
  it('Test 6 — param naming uses default "p" prefix (no leakage from blended s_ prefix)', async () => {
    // The simple builder never sets a custom paramPrefix — all bound params must
    // be named @p0, @p1, ... (never @s_main_0 or any slice-style name).
    const result = await builder.buildQuery(tableDefinition('proj.dataset.events'), {
      columns: ['event_id', 'amount'],
      filters: [
        { column: 'amount', operator: 'gt', value: 100 },
        { column: 'event_id', operator: 'eq', value: 'click' },
      ],
    });

    if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');

    // Both params must use the default 'p' prefix
    expect(result.sql).toContain('@p0');
    expect(result.sql).toContain('@p1');

    // Slice-style prefixes must not appear
    expect(result.sql).not.toMatch(/@s_/);

    // Verify param array follows the 'p' prefix contract
    expect(result.params).toHaveLength(2);
    expect(result.params[0].name).toBe('p0');
    expect(result.params[1].name).toBe('p1');
    expect(result.params[0].value).toBe(100);
    expect(result.params[1].value).toBe('click');
  });

  // -------------------------------------------------------------------------
  it('Test 7 — same context produces byte-identical SQL (simple path)', async () => {
    // Mirror of blended-determinism Test 1: verifies no internal state drift
    // between repeated calls on the simple builder.
    const definition = tableDefinition('proj.dataset.events');
    const options = {
      columns: ['event_id', 'amount', 'session_id'],
      filters: [
        { column: 'amount', operator: 'gt' as const, value: 50 },
        { column: 'session_id', operator: 'is_not_null' as const },
      ],
      sort: [{ column: 'amount', direction: 'desc' as const }],
      limit: 500,
    };

    const result1 = await builder.buildQuery(definition, options);
    const result2 = await builder.buildQuery(definition, options);

    if (!isQueryBuildResult(result1)) throw new Error('expected QueryBuildResult (call 1)');
    if (!isQueryBuildResult(result2)) throw new Error('expected QueryBuildResult (call 2)');

    expect(result1.sql).toEqual(result2.sql);
  });

  // -------------------------------------------------------------------------
  it('Test 8 — filters + sort + limit on a view definition produces correct full-combo SQL', async () => {
    // The existing spec checks view FROM correctness (single filter) but does not
    // exercise the full WHERE + ORDER BY + LIMIT combo on a view-type definition.
    const result = await builder.buildQuery(viewDefinition('proj.ds.my_analytics_view'), {
      columns: ['session_id', 'revenue'],
      filters: [{ column: 'revenue', operator: 'gte', value: 1000 }],
      sort: [{ column: 'revenue', direction: 'desc' }],
      limit: 100,
    });

    if (!isQueryBuildResult(result)) throw new Error('expected QueryBuildResult');

    const sql = result.sql;

    // FROM must reference the view (dot-separated FQN → backtick-quoted parts) with alias
    expect(sql).toContain('FROM `proj`.`ds`.`my_analytics_view` AS main');

    // WHERE must appear before ORDER BY
    expect(sql).toContain('WHERE main.`revenue` >= @p0');
    expect(sql.indexOf('WHERE')).toBeLessThan(sql.indexOf('ORDER BY'));

    // ORDER BY must appear before LIMIT
    expect(sql).toContain('ORDER BY\n  main.`revenue` DESC');
    expect(sql.indexOf('ORDER BY')).toBeLessThan(sql.indexOf('LIMIT'));

    // LIMIT at the end
    expect(sql.trimEnd().endsWith('LIMIT 100')).toBe(true);

    // Param bound correctly
    expect(result.params).toHaveLength(1);
    expect(result.params[0]).toEqual({ name: 'p0', value: 1000 });
  });

  // -------------------------------------------------------------------------
  it('Test 9 — negative LIMIT throws at the renderer level', async () => {
    // renderLimit guards: if (!Number.isInteger(limit) || limit < 0) → throws.
    // The simple builder propagates this error. limit: 0 is valid (LIMIT 0),
    // but limit: -5 must throw.
    await expect(
      builder.buildQuery(tableDefinition('proj.dataset.events'), {
        columns: ['event_id'],
        limit: -5,
      })
    ).rejects.toThrow(/Invalid LIMIT value/);
  });
});
