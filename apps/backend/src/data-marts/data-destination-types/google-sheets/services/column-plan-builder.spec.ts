import { PreviousImportedColumn } from '../../../dto/domain/column-plan.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { ColumnPlanBuilder } from './column-plan-builder';

describe('ColumnPlanBuilder', () => {
  let builder: ColumnPlanBuilder;

  beforeEach(() => {
    builder = new ColumnPlanBuilder();
  });

  /**
   * Convenience helper: build `ReportDataHeader[]` from a list of names so
   * test cases stay focused on column ordering, not full DTO construction.
   */
  const headers = (...names: string[]): ReportDataHeader[] =>
    names.map(name => new ReportDataHeader(name));

  /**
   * Build aliased headers when a test exercises alias-aware behavior.
   * Items are written as `name|alias` for readability, e.g. `aliased('date|Date', 'cost')`.
   */
  const aliased = (...specs: string[]): ReportDataHeader[] =>
    specs.map(spec => {
      const [name, alias] = spec.split('|');
      return new ReportDataHeader(name, alias);
    });

  /**
   * Build `PreviousImportedColumn[]` with no aliases — covers the common
   * case where the previous refresh wrote names directly into row 1.
   */
  const prev = (...names: string[]): PreviousImportedColumn[] =>
    names.map(name => new PreviousImportedColumn(name));

  /** Build `PreviousImportedColumn[]` from `name|alias` specs. */
  const prevAliased = (...specs: string[]): PreviousImportedColumn[] =>
    specs.map(spec => {
      const [name, alias] = spec.split('|');
      return new PreviousImportedColumn(name, alias);
    });

  /**
   * Assert that a plan exposes the expected ops in the expected order.
   * Compared as plain tuples to keep failure messages readable.
   */
  const opsTuples = (plan: ReturnType<ColumnPlanBuilder['build']>) =>
    plan.ops.map(op => [op.kind, op.atIndex, op.name] as const);

  describe('first run', () => {
    it('writes desired columns in SQL order when no metadata and empty sheet', () => {
      const plan = builder.build([], null, headers('a', 'b', 'c'));

      expect(plan.isFirstRun).toBe(true);
      expect(plan.finalImportedNames).toEqual(['a', 'b', 'c']);
      expect(plan.ops).toEqual([]);
      expect(plan.lastImportedColIndex).toBe(2);
      expect(plan.prevLastImportedColIndex).toBe(-1);
      expect(plan.nameToFinalIndex.get('a')).toBe(0);
      expect(plan.nameToFinalIndex.get('b')).toBe(1);
      expect(plan.nameToFinalIndex.get('c')).toBe(2);
      // Nothing imported before the first run — no formats to capture.
      expect(plan.currentImportedNames).toEqual([]);
    });

    it('overwrites stale row-1 content when metadata is missing', () => {
      // User had unrelated headers but never linked the sheet to ODM before.
      const plan = builder.build(['x', 'y'], null, headers('a', 'b'));

      expect(plan.isFirstRun).toBe(true);
      expect(plan.finalImportedNames).toEqual(['a', 'b']);
      expect(plan.ops).toEqual([]);
    });

    it('treats wiped row 1 as first run even when OWOX_COLUMNS metadata exists', () => {
      const plan = builder.build([], prev('a', 'b'), headers('a', 'b'));

      expect(plan.isFirstRun).toBe(true);
      expect(plan.finalImportedNames).toEqual(['a', 'b']);
      expect(plan.ops).toEqual([]);
    });

    it('handles empty desired headers on first run', () => {
      const plan = builder.build([], null, headers());

      expect(plan.isFirstRun).toBe(true);
      expect(plan.finalImportedNames).toEqual([]);
      expect(plan.lastImportedColIndex).toBe(-1);
    });
  });

  describe('subsequent run — no structural change', () => {
    it('emits no ops when desired schema matches current row 1', () => {
      const plan = builder.build(['a', 'b'], prev('a', 'b'), headers('a', 'b'));

      expect(plan.isFirstRun).toBe(false);
      expect(plan.ops).toEqual([]);
      expect(plan.finalImportedNames).toEqual(['a', 'b']);
      expect(plan.prevLastImportedColIndex).toBe(1);
    });

    it('keeps user-driven column reorder intact (row-1 order wins)', () => {
      // ODM previously wrote [date, campaign, clicks, cost]; user dragged
      // columns into a different order; SQL still asks for the same names.
      const plan = builder.build(
        ['date', 'cost', 'campaign', 'clicks'],
        prev('date', 'campaign', 'clicks', 'cost'),
        headers('date', 'campaign', 'clicks', 'cost')
      );

      expect(plan.ops).toEqual([]);
      expect(plan.finalImportedNames).toEqual(['date', 'cost', 'campaign', 'clicks']);
      expect(plan.nameToFinalIndex.get('cost')).toBe(1);
      expect(plan.nameToFinalIndex.get('campaign')).toBe(2);
      // `currentImportedNames` reflects the sheet's pre-write order so the
      // writer can key captured column formats to the right canonical name.
      expect(plan.currentImportedNames).toEqual(['date', 'cost', 'campaign', 'clicks']);
    });

    it('exposes currentImportedNames with aliases resolved back to canonical names', () => {
      // Row 1 shows aliases; currentImportedNames must be the canonical names
      // (keys the writer uses for the captured-format map).
      const plan = builder.build(
        ['Date', 'Cost'],
        prevAliased('date|Date', 'cost|Cost'),
        aliased('date|Date', 'cost|Cost')
      );

      expect(plan.currentImportedNames).toEqual(['date', 'cost']);
    });

    it('ignores user content right of the imported range', () => {
      // `U` is a user-added column; ODM only owns indices 0..1.
      const plan = builder.build(['a', 'b', 'U'], prev('a', 'b'), headers('a', 'b'));

      expect(plan.ops).toEqual([]);
      expect(plan.finalImportedNames).toEqual(['a', 'b']);
    });
  });

  describe('subsequent run — additions', () => {
    it('appends a new SQL column at the right edge of the imported range', () => {
      const plan = builder.build(['a', 'b', 'U'], prev('a', 'b'), headers('a', 'b', 'c'));

      expect(opsTuples(plan)).toEqual([['insert', 2, 'c']]);
      expect(plan.finalImportedNames).toEqual(['a', 'b', 'c']);
      expect(plan.lastImportedColIndex).toBe(2);
    });

    it('appends multiple new columns in SQL order', () => {
      const plan = builder.build(['a'], prev('a'), headers('a', 'b', 'c'));

      expect(opsTuples(plan)).toEqual([
        ['insert', 1, 'b'],
        ['insert', 2, 'c'],
      ]);
      expect(plan.finalImportedNames).toEqual(['a', 'b', 'c']);
    });
  });

  describe('subsequent run — deletions', () => {
    it('deletes a removed column and shifts user content left', () => {
      // ODM owned [c,a,b]; user added trailing column `U`. SQL drops `c`.
      const plan = builder.build(['c', 'a', 'b', 'U'], prev('c', 'a', 'b'), headers('a', 'b'));

      expect(opsTuples(plan)).toEqual([['delete', 0, 'c']]);
      expect(plan.finalImportedNames).toEqual(['a', 'b']);
      expect(plan.prevLastImportedColIndex).toBe(2);
    });

    it('deletes multiple removed columns from highest index first', () => {
      const plan = builder.build(['a', 'b', 'c'], prev('a', 'b', 'c'), headers('b'));

      // Both `a` (idx 0) and `c` (idx 2) are dropped; emit in descending order.
      expect(opsTuples(plan)).toEqual([
        ['delete', 2, 'c'],
        ['delete', 0, 'a'],
      ]);
      expect(plan.finalImportedNames).toEqual(['b']);
    });
  });

  describe('subsequent run — mixed add and remove', () => {
    it('emits deletes before inserts and lands on the correct final layout', () => {
      const plan = builder.build(['a', 'b', 'c', 'U'], prev('a', 'b', 'c'), headers('b', 'c', 'd'));

      expect(opsTuples(plan)).toEqual([
        ['delete', 0, 'a'],
        ['insert', 2, 'd'],
      ]);
      expect(plan.finalImportedNames).toEqual(['b', 'c', 'd']);
    });

    it('honors user-driven reorder while adding a new column', () => {
      const plan = builder.build(
        ['c', 'a', 'b', 'U'],
        prev('a', 'b', 'c'),
        headers('a', 'b', 'c', 'd')
      );

      expect(opsTuples(plan)).toEqual([['insert', 3, 'd']]);
      expect(plan.finalImportedNames).toEqual(['c', 'a', 'b', 'd']);
    });
  });

  describe('rename in SQL', () => {
    it('treats a renamed column as delete + insert (formulas referencing old name break with #REF!)', () => {
      const plan = builder.build(['a', 'b'], prev('a', 'b'), headers('a', 'bb'));

      expect(opsTuples(plan)).toEqual([
        ['delete', 1, 'b'],
        ['insert', 1, 'bb'],
      ]);
      expect(plan.finalImportedNames).toEqual(['a', 'bb']);
    });
  });

  describe('alias-aware mapping (Output Schema aliases)', () => {
    it('translates row-1 aliases back to canonical names — stable refresh', () => {
      // Output Schema sets aliases "Date" and "Cost"; row 1 shows aliases.
      // No structural change should be emitted.
      const plan = builder.build(
        ['Date', 'Cost'],
        prevAliased('date|Date', 'cost|Cost'),
        aliased('date|Date', 'cost|Cost')
      );

      expect(plan.ops).toEqual([]);
      expect(plan.finalImportedNames).toEqual(['date', 'cost']);
      expect(plan.nameToFinalIndex.get('date')).toBe(0);
      expect(plan.nameToFinalIndex.get('cost')).toBe(1);
    });

    it('preserves user reorder when aliases are configured', () => {
      // User dragged Cost in front of Date.
      const plan = builder.build(
        ['Cost', 'Date'],
        prevAliased('date|Date', 'cost|Cost'),
        aliased('date|Date', 'cost|Cost')
      );

      expect(plan.ops).toEqual([]);
      expect(plan.finalImportedNames).toEqual(['cost', 'date']);
    });

    it('appends a new column with alias at the right edge of the imported range', () => {
      const plan = builder.build(
        ['Date', 'Cost'],
        prevAliased('date|Date', 'cost|Cost'),
        aliased('date|Date', 'cost|Cost', 'revenue|Revenue')
      );

      expect(opsTuples(plan)).toEqual([['insert', 2, 'revenue']]);
      expect(plan.finalImportedNames).toEqual(['date', 'cost', 'revenue']);
    });

    it('handles the legacy metadata format (plain string names without aliases)', () => {
      // Sheet exported before alias-aware metadata: previous snapshot is just
      // names. Row 1 displays the names too. Expectation: behaves identically
      // to a name-only diff.
      const plan = builder.build(['a', 'b'], prev('a', 'b'), headers('a', 'b', 'c'));

      expect(opsTuples(plan)).toEqual([['insert', 2, 'c']]);
    });

    it('falls back to treating an unknown row-1 string as the name itself', () => {
      // User manually retyped a header in row 1 since the last refresh.
      // The display string is not in the alias→name map; we trust it as the
      // name and let the diff decide whether to keep, delete, or rename it.
      const plan = builder.build(
        ['date', 'manually_renamed_by_user'],
        prevAliased('date|Date', 'cost|Cost'),
        aliased('date|Date', 'cost|Cost')
      );

      // `cost` (with alias `Cost`) is no longer present in row 1, so it gets
      // deleted; `manually_renamed_by_user` is foreign to desired schema, so
      // it gets deleted too. (But desired set still contains `date` and
      // `cost` — `cost` is not in current set, so it gets re-inserted.)
      expect(opsTuples(plan)).toEqual([
        ['delete', 1, 'manually_renamed_by_user'],
        ['insert', 1, 'cost'],
      ]);
      expect(plan.finalImportedNames).toEqual(['date', 'cost']);
    });
  });

  describe('alias↔name collision (C6)', () => {
    it('logs a warning, ignores the second mapping, and does not crash on a collision', () => {
      // Pathological-but-allowed shape: one column named `revenue` exposed
      // as `Revenue`, another column literally named `Revenue` (no alias).
      // Both compete for the display key `Revenue`. There is no clean
      // recovery for "two row-1 cells share the same display string", but
      // the builder MUST:
      //   * detect the collision and emit an actionable warning, and
      //   * still produce a finite plan without throwing.
      // Operators rely on the log to find and rename one of the colliding
      // columns. Downstream duplicate detection (C5 / data integrity) is
      // expected to catch any residual degeneracy.
      const warn = jest.spyOn(builder['logger'], 'warn').mockImplementation(() => undefined);

      expect(() =>
        builder.build(
          ['Revenue', 'Revenue'],
          [new PreviousImportedColumn('revenue', 'Revenue'), new PreviousImportedColumn('Revenue')],
          headers('revenue', 'Revenue')
        )
      ).not.toThrow();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Display string "Revenue" maps to multiple canonical names')
      );
      warn.mockRestore();
    });
  });

  describe('empty cell in row 1 (H1)', () => {
    it('substitutes the canonical name from the previous-run snapshot when a header is blank', () => {
      const warn = jest.spyOn(builder['logger'], 'warn').mockImplementation(() => undefined);

      // User accidentally cleared header `b` in the middle of the imported
      // range. Without recovery, the diff would treat the column as
      // "missing" and delete it, shifting data on the next refresh.
      const plan = builder.build(['a', '', 'c'], prev('a', 'b', 'c'), headers('a', 'b', 'c'));

      // No structural ops needed — the empty cell is recovered to `b` from
      // the prior snapshot, and the diff is a no-op.
      expect(plan.ops).toEqual([]);
      expect(plan.finalImportedNames).toEqual(['a', 'b', 'c']);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Row 1 cell at column index 1 is empty')
      );
      warn.mockRestore();
    });

    it('treats an empty cell as nonexistent when the previous snapshot has no entry for it', () => {
      // Edge case: prev shorter than existingHeaders width. Slicing keeps
      // only the imported region, so this only matters when both are short.
      const plan = builder.build(['a', ''], prev('a', 'b'), headers('a', 'b'));

      // Prev has `b` at index 1 → recover; no structural op needed.
      expect(plan.ops).toEqual([]);
      expect(plan.finalImportedNames).toEqual(['a', 'b']);
    });
  });
});
