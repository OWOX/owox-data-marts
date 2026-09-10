import { collectSchemaFieldPaths } from '../data-storage-types/data-mart-schema.utils';
import type { DataMartSchemaField } from '../data-storage-types/data-mart-schema.type';
import { BlendableSchemaDto } from '../dto/domain/blendable-schema.dto';
import { UNIQUE_COUNT_LABEL } from '../dto/schemas/aggregation-labels';
import { SortRule } from '../dto/schemas/sort-config.schema';
import { buildJoinedUniqueCountColumnName } from './blended-field-name';

/**
 * Every column name an output control may still name on the main Data Mart's CURRENT schema:
 * its field paths — hidden-for-reporting and DISCONNECTED pruned, calculated fields kept (a
 * formula is never returned by the warehouse, so a warehouse-derived status says nothing about
 * it) — plus the main Unique Count output name.
 *
 * The Unique Count name is known whether or not the report has the metric on: a stale sort left
 * after disabling the toggle is a `SORT_COLUMN_NOT_SELECTED` 400, never the disconnected
 * diagnosis, which is reserved for names absent from the schema entirely.
 */
export function collectKnownNativeOutputColumns(
  fields: readonly DataMartSchemaField[]
): Set<string> {
  return new Set([...collectSchemaFieldPaths(fields), UNIQUE_COUNT_LABEL]);
}

/**
 * The same set over a blendable schema: the native names above, the non-hidden blended fields,
 * and one Unique Count output name per joined source the schema offers. A source the schema no
 * longer offers stays disconnected.
 *
 * One function for the two readers that must agree on it: the validator, which turns an unknown
 * name into the disconnected error, and the run path, which drops a sort on one instead of
 * failing the run (`BlendedReportDataService` / `ReportSqlComposerService`).
 */
export function collectKnownOutputColumns(schema: BlendableSchemaDto): Set<string> {
  const known = collectKnownNativeOutputColumns(schema.nativeFields);
  for (const blended of schema.blendedFields) {
    if (blended.isHidden) continue;
    known.add(blended.name);
  }
  for (const source of schema.availableSources ?? []) {
    known.add(buildJoinedUniqueCountColumnName(source.aliasPath));
  }
  return known;
}

/**
 * Splits a stored sort into the rules the current schema can still resolve and the columns it
 * cannot. ORDER BY changes the order of the rows, never their values, so the run paths drop the
 * latter with a warning rather than fail a scheduled run that no editor is ever opened on — the
 * same reasoning the stale Unique Count sort is dropped by. The save paths still reject them.
 *
 * The LIMIT is kept as it is: under a limit, dropping the order can change WHICH rows are
 * delivered (a former top-10 becomes an arbitrary 10), but clearing the limit instead would turn
 * the run into an unbounded export, which is the worse surprise. The warning is what says so.
 */
export function withoutUnknownSortColumns(
  sort: readonly SortRule[],
  knownOutputColumns: ReadonlySet<string>
): { kept: SortRule[]; dropped: string[] } {
  const kept: SortRule[] = [];
  const dropped: string[] = [];
  for (const rule of sort) {
    if (knownOutputColumns.has(rule.column)) kept.push(rule);
    else if (!dropped.includes(rule.column)) dropped.push(rule.column);
  }
  return { kept, dropped };
}
