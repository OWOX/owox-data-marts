import { Injectable, Logger } from '@nestjs/common';
import {
  ColumnPlan,
  PreviousImportedColumn,
  StructuralColumnOp,
} from '../../../dto/domain/column-plan.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';

/**
 * Builds a {@link ColumnPlan} describing how to update the imported column range
 * of a Google Sheet so that:
 *   - existing user-driven column ordering in row 1 is preserved;
 *   - new SQL columns are appended to the right edge of the imported range;
 *   - SQL columns no longer present are removed;
 *   - any content right of the imported range is left untouched.
 *
 * Stateless. Pure function exposed as `@Injectable()` to follow the existing
 * pattern of formatter services in this folder
 * (e.g. `SheetMetadataFormatter`, `SheetHeaderFormatter`).
 */
@Injectable()
export class ColumnPlanBuilder {
  private readonly logger = new Logger(ColumnPlanBuilder.name);

  /**
   * @param existingHeaders - row-1 values from the destination sheet
   *   (FORMATTED_VALUE), trailing-empty cells already trimmed by the caller.
   *   Each entry may be either a column `name` or its user-friendly `alias`,
   *   depending on whether an alias was configured on the previous refresh.
   * @param previousOwoxColumns - the (name, alias?) pairs ODM wrote into the
   *   imported range on the previous refresh, parsed from `OWOX_COLUMNS`
   *   developer metadata. `null` when metadata is absent (first refresh of
   *   the sheet). Used to translate display strings in `existingHeaders`
   *   back to canonical names so the diff is robust to aliasing.
   * @param desiredHeaders - the column schema produced by the current SQL
   *   output, in SQL declaration order.
   */
  public build(
    existingHeaders: string[],
    previousOwoxColumns: PreviousImportedColumn[] | null,
    desiredHeaders: ReportDataHeader[]
  ): ColumnPlan {
    const desiredNames = desiredHeaders.map(h => h.name);

    // First run: no prior ODM metadata, OR row 1 is empty (user wiped headers
    // manually). Either way we treat the sheet as a blank canvas and lay down
    // columns in SQL order without any structural ops.
    const isFirstRun = previousOwoxColumns === null || existingHeaders.length === 0;
    if (isFirstRun) {
      if (previousOwoxColumns !== null && existingHeaders.length === 0) {
        this.logger.warn(
          'OWOX_COLUMNS metadata exists but row 1 is empty — treating as first run.'
        );
      }
      return this.buildFirstRunPlan(desiredNames);
    }

    return this.buildDiffPlan(existingHeaders, previousOwoxColumns, desiredNames);
  }

  /**
   * First-run path: write all desired columns into row 1 in SQL order, no
   * insert/delete ops needed (the writer simply populates A1..Z1 with the
   * header row).
   */
  private buildFirstRunPlan(desiredNames: string[]): ColumnPlan {
    const nameToFinalIndex = new Map<string, number>();
    desiredNames.forEach((name, idx) => nameToFinalIndex.set(name, idx));

    return new ColumnPlan(
      true, // isFirstRun
      desiredNames,
      [], // ops
      nameToFinalIndex,
      desiredNames.length - 1, // lastImportedColIndex (-1 if empty)
      -1, // prevLastImportedColIndex
      [] // currentImportedNames — nothing imported before the first run
    );
  }

  /**
   * Subsequent-run path: diff the imported region (row-1 cells claimed by
   * `OWOX_COLUMNS`) against the desired SQL schema and emit structural ops.
   *
   * Op ordering invariant: deletes first, sorted by `atIndex` descending so
   * later deletes do not shift earlier ones. Inserts follow, each at the
   * right edge of the (currently surviving) imported region. This keeps
   * `atIndex` valid at the moment of application and ensures user content,
   * which sits past the imported region, shifts predictably right with each
   * insert.
   */
  private buildDiffPlan(
    existingHeaders: string[],
    previousOwoxColumns: PreviousImportedColumn[],
    desiredNames: string[]
  ): ColumnPlan {
    const prevWidth = previousOwoxColumns.length;
    const prevLastImportedColIndex = prevWidth - 1;

    // Anything past `prevWidth` is user content; we never touch it.
    const currentImportedDisplay = existingHeaders.slice(0, prevWidth);

    // Translate row-1 display strings (which can be aliases) to canonical
    // names. The alias→name map is built from the previous-run snapshot.
    //
    // Collision handling: two columns in the same imported range could
    // (rarely, but in principle) share the same display string — e.g. one
    // column with name=`revenue`, alias=`Revenue` and another with
    // name=`Revenue` and no alias. In that case the first mapping wins and
    // we emit a warning; the second column will fall through to the
    // name-as-display fallback below, which is enough for the diff to
    // recover without silently mis-routing data.
    const aliasToName = new Map<string, string>();
    for (const { name, alias } of previousOwoxColumns) {
      const displayKey = alias ?? name;
      const existing = aliasToName.get(displayKey);
      if (existing !== undefined && existing !== name) {
        this.logger.warn(
          `Display string "${displayKey}" maps to multiple canonical names ` +
            `("${existing}" and "${name}") in OWOX_COLUMNS — keeping the first. ` +
            `Consider renaming one of the columns to avoid future ambiguity.`
        );
        continue;
      }
      aliasToName.set(displayKey, name);
    }

    // Convert each row-1 cell to a canonical name:
    //   * Non-empty + known display string → resolve via aliasToName.
    //   * Non-empty + unknown display string → trust as canonical name
    //     (handles the case where the user manually edited a header).
    //   * Empty cell within imported region → substitute the canonical name
    //     from the previous-run snapshot at the same index. This protects
    //     against a user accidentally clearing a header: instead of
    //     "phantom" the column out of the diff and silently shifting data
    //     on the next refresh, we treat the column as if its header were
    //     still there. Emit a warning so the operator sees the recovery.
    const currentImportedNames = currentImportedDisplay.map((display, idx) => {
      if (display) {
        return aliasToName.get(display) ?? display;
      }
      const recovered = previousOwoxColumns[idx]?.name;
      if (recovered) {
        this.logger.warn(
          `Row 1 cell at column index ${idx} is empty — recovering canonical ` +
            `name "${recovered}" from OWOX_COLUMNS snapshot.`
        );
        return recovered;
      }
      return '';
    });

    const desiredSet = new Set(desiredNames);
    const currentSet = new Set(currentImportedNames.filter(Boolean));

    // Survivors keep their existing positions (preserves user ordering).
    const survivors = currentImportedNames.filter(name => !!name && desiredSet.has(name));
    // New names are appended in SQL order.
    const toAdd = desiredNames.filter(name => !currentSet.has(name));

    const ops: StructuralColumnOp[] = [];

    // Deletes: emit by descending atIndex so subsequent indexes stay valid.
    const deleteEntries: Array<{ index: number; name: string }> = [];
    currentImportedNames.forEach((name, idx) => {
      if (name && !desiredSet.has(name)) {
        deleteEntries.push({ index: idx, name });
      }
    });
    deleteEntries.sort((a, b) => b.index - a.index);
    for (const { index, name } of deleteEntries) {
      ops.push(new StructuralColumnOp('delete', index, name));
    }

    // Inserts: each at the right edge of the imported region as it grows.
    let nextInsertIndex = survivors.length;
    for (const name of toAdd) {
      ops.push(new StructuralColumnOp('insert', nextInsertIndex, name));
      nextInsertIndex++;
    }

    const finalImportedNames = [...survivors, ...toAdd];
    const nameToFinalIndex = new Map<string, number>();
    finalImportedNames.forEach((name, idx) => nameToFinalIndex.set(name, idx));

    return new ColumnPlan(
      false, // isFirstRun
      finalImportedNames,
      ops,
      nameToFinalIndex,
      finalImportedNames.length - 1,
      prevLastImportedColIndex,
      currentImportedNames // canonical names at current row-1 positions
    );
  }
}
