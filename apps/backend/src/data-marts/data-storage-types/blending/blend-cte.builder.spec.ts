import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import {
  makeChain,
  makeRelationship,
} from '../interfaces/__fixtures__/blended-query-builder-fixtures';
import { BlendCteBuilder } from './blend-cte.builder';
import { BlendedSqlDialect, renderLeftJoinOn } from './blended-sql-dialect';

// Both guards under test are ABOUT unquoted identifiers, so the dialect here spells every
// identifier bare — the same shape Athena/Redshift/Databricks emit for a safe name.
const dialect: BlendedSqlDialect = {
  quoteIdentifier: name => name,
  quoteFieldRef: ref => ref,
  buildAggregation: (fn, fieldName) => `${fn}(${fieldName})`,
  buildRowSurrogate: partitionByRefs =>
    `ROW_NUMBER() OVER (PARTITION BY ${partitionByRefs.join(', ')})`,
  clauseRenderer: () => null,
};

const ordersChain = makeChain({
  relationship: makeRelationship({
    id: 'rel-orders',
    targetAlias: 'orders',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'order_id' }],
  }),
  targetTableReference: 'orders_table',
  parentAlias: 'main',
  blendedFields: [],
});

// cteName = `orders_items`, parentAlias = `orders`.
const itemsChain = makeChain({
  relationship: makeRelationship({
    id: 'rel-items',
    targetAlias: 'items',
    joinConditions: [{ sourceFieldName: 'order_id', targetFieldName: 'order_id' }],
  }),
  targetTableReference: 'items_table',
  parentAlias: 'orders',
  blendedFields: [],
});

describe('BlendCteBuilder', () => {
  describe('buildTree', () => {
    // A chain whose parent is absent used to vanish from the tree: its CTE was never emitted,
    // while its columns stayed in the SELECT and fell back to `main.<col>` — an unrecognized
    // name at the warehouse, or a wrong resolution. Reachable from a SAVED report whose
    // relationship was deleted (the resolver skips it but keeps its descendants).
    it('throws instead of dropping a chain whose parentAlias is absent', () => {
      const builder = new BlendCteBuilder(dialect);
      const build = () => builder.buildTree([itemsChain]);

      expect(build).toThrow(BusinessViolationException);
      // Both the orphan and the parent it can no longer reach are named, plus how to repair it.
      expect(build).toThrow(/'orders_items' is joined through parent 'orders'/);
      expect(build).toThrow(/Re-save the report's joined fields/);
    });

    // A nested join key was accepted at save time (the validator looked it up among TOP-LEVEL
    // schema fields, found nothing, and recorded a warning both callers discarded) and then
    // produced SQL that cannot resolve: the dedup CTE projects `address.city` with no alias, so
    // every engine names the output column `city`, while the join back addresses
    // `<cte>.address.city`. The API rejects it now; this catches what is already stored.
    it('throws on a nested (dotted) join key rather than emitting SQL that cannot resolve', () => {
      const nestedChain = makeChain({
        relationship: makeRelationship({
          id: 'rel-nested',
          targetAlias: 'users',
          joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'address.city' }],
        }),
        targetTableReference: 'users_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const build = () => new BlendCteBuilder(dialect).buildTree([nestedChain]);

      expect(build).toThrow(BusinessViolationException);
      expect(build).toThrow(/address\.city/);
      expect(build).toThrow(/must be a top-level column/);
    });

    // A relationship with no conditions is a supported DRAFT at save time, so it can reach the
    // builder. Every renderer would emit `LEFT JOIN <cte> ON ` with a dangling ON and a GROUP BY
    // with no keys — a raw warehouse syntax error (5xx). The value sleeve already refused it; the
    // paths that build no sleeve (a plain blended report, a COUNT DISTINCT sleeve) did not.
    it('throws on a draft relationship with no join conditions, on every path', () => {
      const draftChain = makeChain({
        relationship: makeRelationship({
          id: 'rel-draft',
          targetAlias: 'orders',
          joinConditions: [],
        }),
        targetTableReference: 'orders_table',
        parentAlias: 'main',
        blendedFields: [],
      });
      const build = () => new BlendCteBuilder(dialect).buildTree([draftChain]);

      expect(build).toThrow(BusinessViolationException);
      expect(build).toThrow(/has no join conditions/);
      expect(build).toThrow(/Edit the relationship to add one/);
    });

    it('nests a child under its parent when both chains are present', () => {
      const builder = new BlendCteBuilder(dialect);

      const roots = builder.buildTree([ordersChain, itemsChain]);

      expect(roots).toHaveLength(1);
      expect(roots[0].chain.cteName).toBe('orders');
      expect(roots[0].children.map(c => c.chain.cteName)).toEqual(['orders_items']);
    });
  });

  describe('buildRawCte — reserved __owox_rid alias', () => {
    const rawCte = (columns: string[], includeRowSurrogate: boolean) => {
      const builder = new BlendCteBuilder(dialect);
      return builder.buildRawCte(
        'orders_raw',
        'orders_table',
        'Orders',
        '/ui/proj/data-marts/sub-1/data-setup',
        columns,
        undefined,
        undefined,
        undefined,
        includeRowSurrogate,
        ['order_id']
      );
    };

    // The alias is a safe identifier, so `quoteIdentifier` leaves it unquoted — Athena and
    // Redshift then fold `__OWOX_RID` to lower case and Spark matches it case-insensitively, so
    // the exact-case guard let a real column of that name collide with the surrogate inside the
    // raw CTE (two `__owox_rid` columns) instead of failing.
    it('rejects a source column differing from __owox_rid only by case', () => {
      const build = () => rawCte(['__OWOX_RID', 'amount'], true);

      expect(build).toThrow(BusinessViolationException);
      // Reported in the user's OWN spelling — that is the column they have to find and rename.
      expect(build).toThrow(/__OWOX_RID/);
    });

    it('rejects the exactly-spelled __owox_rid column too', () => {
      const build = () => rawCte(['__owox_rid', 'amount'], true);

      expect(build).toThrow(BusinessViolationException);
    });

    // The MCP path must never forward a raw exception message (it can carry SQL and identifiers),
    // so it names the column from `errorDetails` alone. Drop the key and that guidance silently
    // degrades to an opaque "query failed" — pin the producing half of that contract here.
    it('carries the colliding column in errorDetails for callers that cannot forward the message', () => {
      try {
        rawCte(['__OWOX_RID', 'amount'], true);
        throw new Error('expected a BusinessViolationException');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessViolationException);
        expect((err as BusinessViolationException).errorDetails).toEqual({
          reservedNameColumns: ['__OWOX_RID'],
        });
      }
    });

    it('does NOT reject the name on a raw CTE that projects no surrogate', () => {
      const { sql } = rawCte(['__OWOX_RID', 'amount'], false);

      expect(sql).toContain('__OWOX_RID');
      expect(sql).not.toContain('ROW_NUMBER()');
    });
  });
});

// The blend emits `LEFT JOIN <right> ON <left>.<src> = <right>.<tgt>` in four places — a
// parent's `_joined` CTE, the outer query, a sleeve's raw-ancestor join and a sleeve's dedup
// join. They must render the SAME condition for the same relationship, or a sleeve aggregates
// over a different row set than the query it feeds. It was four independent copies of the same
// map/join, held together only by a prose comment across a class boundary.
describe('renderLeftJoinOn', () => {
  const conditions = [
    { sourceFieldName: 'order_id', targetFieldName: 'id' },
    { sourceFieldName: 'tenant', targetFieldName: 'tenant' },
  ];

  it('ANDs every condition, source on the left and target on the right', () => {
    const sql = renderLeftJoinOn(dialect, {
      leftAlias: 'main',
      rightAlias: 'orders',
      joinConditions: conditions,
    });

    expect(sql).toBe(
      'LEFT JOIN orders ON main.order_id = orders.id AND main.tenant = orders.tenant'
    );
  });

  it('indents when the caller nests it inside a subquery', () => {
    const sql = renderLeftJoinOn(dialect, {
      leftAlias: 'main',
      rightAlias: 'orders_raw',
      joinConditions: [conditions[0]],
      indent: '    ',
    });

    expect(sql).toBe('    LEFT JOIN orders_raw ON main.order_id = orders_raw.id');
  });
});
