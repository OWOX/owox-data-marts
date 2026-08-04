/**
 * Shared pieces of the `_kept_groups` restriction, so the flat renderer and the blended
 * builder cannot drift: they emit the same SQL shape from two independent code paths.
 */

/**
 * CTE / derived-table name holding the dimension tuples of the groups a report's metric (HAVING)
 * filters keep. Only a Totals query builds it — see `GroupRestriction`. Reserved like the sleeve
 * names: `disambiguateSleeveCteNames` seeds it so no sleeve can take the same name.
 */
export const KEPT_GROUPS_CTE = '_kept_groups';

/**
 * Output alias of the i-th kept-group key.
 *
 * The projection is deliberately NOT named after the dimension. The restriction is joined into a
 * query whose own columns are frequently UNqualified (four of the five flat dialects select bare
 * `"channel"` off an unaliased FROM), so a subquery projecting a column of the same name makes
 * every outer reference to it ambiguous — `AMBIGUOUS_ATTRIBUTE` on Trino, "ambiguous column name"
 * on Snowflake, and so on. A private name is inert in every dialect and needs no cooperation from
 * the caller's FROM clause.
 */
export function keptGroupKeyAlias(index: number): string {
  return `_owox_kg_${index}`;
}

/**
 * Output alias of the i-th dimension a metric sleeve projects.
 *
 * Same reasoning as `keptGroupKeyAlias`, for a different collision: projecting each dimension
 * under its OWN name means two dimensions differing only in case (`Country` and `country` — one
 * native, one a blended output alias the user chose) become the same column. Only Snowflake
 * overrides `quoteIdentifier`; every other dialect leaves a safe identifier UNQUOTED, and the
 * engine then folds or resolves it case-insensitively — so the sleeve CTE ends up with two
 * identically-named columns and the join back on them is ambiguous. A positional private alias
 * cannot collide with anything the user can name.
 */
export function sleeveDimensionAlias(index: number): string {
  return `_owox_dim_${index}`;
}

/**
 * The kept-groups SELECT list: the report's own GROUP BY expressions, each under its private
 * alias. Built FROM `renderAggregatedSelect().groupByParts` rather than re-derived, so the
 * projection, the GROUP BY and the outer join's left-hand side are one expression, not three.
 *
 * With no dimensions the report is a single grand-total group, and an empty SELECT list is a
 * syntax error on every engine — project a constant instead; the HAVING alone decides whether the
 * one row survives.
 */
export function buildKeptGroupsProjection(
  groupByParts: readonly string[],
  dimensions: readonly string[],
  quoteIdentifier: (name: string) => string
): string[] {
  assertKeptGroupKeys(groupByParts, dimensions);
  if (groupByParts.length === 0) {
    return [`1 AS ${quoteIdentifier(keptGroupKeyAlias(0))}`];
  }
  return groupByParts.map((expr, i) => `${expr} AS ${quoteIdentifier(keptGroupKeyAlias(i))}`);
}

/**
 * The NULL-safe join pairs binding the outer query to the kept groups. The left side is the
 * report's own grouping expression (a date bucket included, which is why it comes from
 * `groupByParts` and not from the bare column reference).
 */
export function buildKeptGroupsJoinPairs(
  groupByParts: readonly string[],
  dimensions: readonly string[],
  quotedAlias: string,
  quoteIdentifier: (name: string) => string,
  isNanSafe: (column: string) => boolean
): { left: string; right: string; nanSafe: boolean }[] {
  assertKeptGroupKeys(groupByParts, dimensions);
  return groupByParts.map((expr, i) => ({
    left: expr,
    right: `${quotedAlias}.${quoteIdentifier(keptGroupKeyAlias(i))}`,
    nanSafe: isNanSafe(dimensions[i]),
  }));
}

/**
 * `groupByParts[i]` must be the key for `dimensions[i]`: the projection aliases and the join pairs
 * are positional. `renderAggregatedSelect` guarantees it when called with NO aggregation rules —
 * a rule would turn its column into a metric and drop it from the keys, shifting every later index
 * onto the wrong dimension. Assert rather than trust, since the result is a silently wrong number.
 */
function assertKeptGroupKeys(groupByParts: readonly string[], dimensions: readonly string[]): void {
  if (groupByParts.length !== dimensions.length) {
    throw new Error(
      `kept-groups restriction: ${dimensions.length} dimension(s) ` +
        `[${dimensions.join(', ')}] produced ${groupByParts.length} grouping key(s) ` +
        `[${groupByParts.join(', ')}] — every restriction dimension must be a GROUP BY key, ` +
        `so the projected keys and the join pairs line up by position`
    );
  }
}
