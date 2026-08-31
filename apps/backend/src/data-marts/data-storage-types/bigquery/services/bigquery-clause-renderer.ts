import { Injectable } from '@nestjs/common';
import { SqlClauseRenderer, RenderedClause } from '../../utils/sql-clause-renderer';
import { FilterRule } from '../../../dto/schemas/filter-config.schema';
import { DateTruncUnit } from '../../../dto/schemas/date-trunc-config.schema';
import { escapeBigQueryIdentifier } from '../utils/bigquery-identifier.utils';
import { BigQueryFieldType } from '../enums/bigquery-field-type.enum';

@Injectable()
export class BigQueryClauseRenderer extends SqlClauseRenderer {
  protected quoteIdentifier(name: string): string {
    return escapeBigQueryIdentifier(name);
  }

  public override textCastType(): string {
    return 'STRING';
  }

  /**
   * A declared type is a BigQueryFieldType — the API's vocabulary, which GoogleSQL does not answer
   * to: `CAST(x AS FLOAT)` is `Type not found: FLOAT`, measured live. INT64 rather than the
   * declared INTEGER for safety, not necessity: `CAST('1' AS INTEGER)` dry-runs clean, but FLOAT
   * proved an alias accepted elsewhere can still be absent from a CAST, so the canonical name is
   * the one worth spelling.
   *
   * The exact types are BARE here, and MUST stay bare: BigQuery rejects every parameterized type in
   * a CAST (`Parameterized types are not allowed in CAST expressions`), so harmonising them with
   * the other four dialects' `(38,18)` would be a hard query error. It is safe as well as forced —
   * NUMERIC is fixed at (38,9) and BIGNUMERIC at (76.76,38), so neither carries the scale-0 default
   * those spellings exist to escape.
   */
  private static readonly CAST_TYPE_BY_DECLARED_TYPE: ReadonlyMap<string, string> = new Map([
    [BigQueryFieldType.INTEGER, 'INT64'],
    [BigQueryFieldType.FLOAT, 'FLOAT64'],
    [BigQueryFieldType.NUMERIC, 'NUMERIC'],
    [BigQueryFieldType.BIGNUMERIC, 'BIGNUMERIC'],
  ]);

  public override castTypeForDeclaredType(declaredType: string): string | undefined {
    return BigQueryClauseRenderer.CAST_TYPE_BY_DECLARED_TYPE.get(declaredType.trim().toUpperCase());
  }

  // Column types whose values carry a time component: relative_date must compare
  // the DATE part against CURRENT_DATE()-based bounds, since BigQuery does not
  // coerce TIMESTAMP/DATETIME to DATE in a comparison (it raises a type error).
  private static readonly SUBDAY_DATE_TYPES = new Set([
    'DATETIME',
    'TIMESTAMP',
    'TIMESTAMP WITH TIME ZONE',
  ]);

  // Date/time column types whose value comparisons need a typed placeholder. The
  // BigQuery SDK infers a param's type from its JS value, so a date filter binds
  // as STRING and `date_col = @p` raises "No matching signature for =" — wrap the
  // placeholder in CAST(@p AS <type>) so the string is parsed to the column type.
  private static readonly DATE_CAST_TYPES = new Set(['DATE', 'DATETIME', 'TIME', 'TIMESTAMP']);

  // `valueCastType` is the declared type a Calculated Field's comparison imposes —
  // disjoint from the date set above, since it is only ever a numeric target. It matters most on
  // this dialect: the SDK types a param from its JS value, so `= 10` and `= '10'` over one field
  // were measured flipping between `No matching signature for operator =` and the right answer.
  private placeholder(paramName: string, columnType?: string, valueCastType?: string): string {
    const castType =
      valueCastType ??
      (columnType && BigQueryClauseRenderer.DATE_CAST_TYPES.has(columnType)
        ? columnType
        : undefined);
    return castType ? `CAST(@${paramName} AS ${castType})` : `@${paramName}`;
  }

  protected override renderPercentile(p: 25 | 50 | 75 | 95, columnRef: string): string {
    return `APPROX_QUANTILES(${columnRef}, 100)[OFFSET(${p})]`;
  }

  // CAST to STRING so STRING_AGG is valid on a non-string column (e.g. a DATE).
  protected override renderStringAgg(columnRef: string): string {
    return `STRING_AGG(CAST(${columnRef} AS STRING), ', ')`;
  }

  // Reduces a date/time column to a DATE bucket. The wrap depends on the column type
  // (verified on real BigQuery):
  //   - DATE: DATE_TRUNC accepts a DATE directly; the DATE() wrap is redundant (and a
  //     DATE column never carries a tz — the validator rejects that upstream).
  //   - TIMESTAMP (± tz) / DATETIME without tz: DATE(col[, tz]) covers these directly.
  //   - DATETIME WITH tz: there is no DATE(DATETIME, tz) overload, so interpret the
  //     tz-naive wall clock in the target zone via TIMESTAMP(datetime, tz) first, then
  //     read the date back in that zone.
  protected override renderDateTrunc(
    columnRef: string,
    unit: DateTruncUnit,
    timeZone?: string,
    columnType?: string
  ): string {
    this.assertSafeDateTrunc(unit, timeZone);
    const type = columnType?.trim().toUpperCase();
    let dateExpr: string;
    if (type === 'DATE') {
      dateExpr = columnRef;
    } else if (timeZone && type === 'DATETIME') {
      dateExpr = `DATE(TIMESTAMP(${columnRef}, '${timeZone}'), '${timeZone}')`;
    } else {
      dateExpr = timeZone ? `DATE(${columnRef}, '${timeZone}')` : `DATE(${columnRef})`;
    }
    return `DATE_TRUNC(${dateExpr}, ${unit})`;
  }

  protected renderFilterFragment(
    rule: FilterRule,
    paramName: string,
    col: string,
    columnType?: string,
    valueCastType?: string
  ): RenderedClause {
    const ph = this.placeholder(paramName, columnType, valueCastType);
    switch (rule.operator) {
      case 'eq':
        return { sql: `${col} = ${ph}`, params: [{ name: paramName, value: rule.value }] };
      // Null-inclusive: SQL `<>` drops NULLs (UNKNOWN). BI expectation is that
      // "is not X" keeps rows where the column is missing — keep them explicitly.
      // Portable form: Redshift has no IS DISTINCT FROM, so all engines share this.
      case 'neq':
        return {
          sql: `(${col} IS NULL OR ${col} <> ${ph})`,
          params: [{ name: paramName, value: rule.value }],
        };
      case 'gt':
        return { sql: `${col} > ${ph}`, params: [{ name: paramName, value: rule.value }] };
      case 'lt':
        return { sql: `${col} < ${ph}`, params: [{ name: paramName, value: rule.value }] };
      case 'gte':
        return { sql: `${col} >= ${ph}`, params: [{ name: paramName, value: rule.value }] };
      case 'lte':
        return { sql: `${col} <= ${ph}`, params: [{ name: paramName, value: rule.value }] };
      // Substring/affix matchers use BigQuery built-ins instead of LIKE.
      // BigQuery's LIKE has no ESCAPE clause, so user input "100%" or "a_b"
      // would smuggle wildcards. STRPOS / STARTS_WITH / ENDS_WITH treat the
      // bound parameter as a literal substring with no special characters.
      case 'contains':
        return {
          sql: `STRPOS(${col}, @${paramName}) > 0`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'not_contains':
        // STRPOS(NULL, …) is NULL, so bare `= 0` drops NULL rows; keep them.
        return {
          sql: `(${col} IS NULL OR STRPOS(${col}, @${paramName}) = 0)`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'starts_with':
        return {
          sql: `STARTS_WITH(${col}, @${paramName})`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'ends_with':
        return {
          sql: `ENDS_WITH(${col}, @${paramName})`,
          params: [{ name: paramName, value: String(rule.value) }],
        };
      case 'regex':
        return {
          sql: `REGEXP_CONTAINS(${col}, @${paramName})`,
          params: [{ name: paramName, value: rule.value }],
        };
      case 'not_regex':
        return {
          sql: `(${col} IS NULL OR NOT REGEXP_CONTAINS(${col}, @${paramName}))`,
          params: [{ name: paramName, value: rule.value }],
        };
      case 'is_blank':
      case 'is_not_blank':
        return this.renderBlankFragment(rule.operator, col, columnType);
      // Legacy pair (#6779): accepted for saved configs, no longer offered by pickers.
      case 'is_empty':
        return { sql: `(${col} IS NULL OR ${col} = '')`, params: [] };
      case 'is_not_empty':
        return { sql: `(${col} IS NOT NULL AND ${col} != '')`, params: [] };
      case 'is_null':
        return { sql: `${col} IS NULL`, params: [] };
      case 'is_not_null':
        return { sql: `${col} IS NOT NULL`, params: [] };
      case 'is_true':
        return { sql: `${col} = TRUE`, params: [] };
      case 'is_false':
        return { sql: `${col} = FALSE`, params: [] };
      case 'between': {
        const p1 = paramName;
        const p2 = this.nextParamName(paramName);
        return {
          sql:
            `${col} BETWEEN ${this.placeholder(p1, columnType, valueCastType)} ` +
            `AND ${this.placeholder(p2, columnType, valueCastType)}`,
          params: [
            { name: p1, value: rule.value.from },
            { name: p2, value: rule.value.to },
          ],
        };
      }
      case 'in':
      case 'not_in':
        return this.renderInListWithParams(rule, col, paramName, name =>
          this.placeholder(name, columnType, valueCastType)
        );
      case 'relative_date':
        return { sql: this.renderRelativeDate(col, rule.value, columnType), params: [] };
    }
  }

  private renderRelativeDate(
    col: string,
    preset: Extract<FilterRule, { operator: 'relative_date' }>['value'],
    columnType?: string
  ): string {
    // `n` is inlined into SQL below; re-assert the integer locally so the injection
    // barrier does not live solely in the zod schema on the request path (the other
    // renderers carry the same guard).
    if ('n' in preset && (!Number.isInteger(preset.n) || preset.n < 0)) {
      throw new Error(`Invalid relative_date n: ${String(preset.n)}`);
    }
    // Compare the DATE part of a sub-day column so the whole day matches and the
    // DATE-typed bounds don't raise a type mismatch. DATE columns compare directly.
    const lhs =
      columnType && BigQueryClauseRenderer.SUBDAY_DATE_TYPES.has(columnType) ? `DATE(${col})` : col;
    switch (preset.kind) {
      case 'today':
        return `${lhs} = CURRENT_DATE()`;
      case 'yesterday':
        return `${lhs} = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)`;
      case 'last_n_days':
        return (
          `${lhs} >= DATE_SUB(CURRENT_DATE(), INTERVAL ${preset.n} DAY)` +
          ` AND ${lhs} <= CURRENT_DATE()`
        );
      case 'last_n_months':
        return (
          `${lhs} >= DATE_SUB(CURRENT_DATE(), INTERVAL ${preset.n} MONTH)` +
          ` AND ${lhs} <= CURRENT_DATE()`
        );
      // Includes today, mirroring last_n_days (both cover today plus n days out/back).
      case 'next_n_days':
        return (
          `${lhs} >= CURRENT_DATE()` +
          ` AND ${lhs} <= DATE_ADD(CURRENT_DATE(), INTERVAL ${preset.n} DAY)`
        );
      // ISOWEEK, not WEEK: BigQuery's plain WEEK starts on Sunday, while every other
      // storage truncates weeks to Monday — ISOWEEK keeps the boundary consistent.
      case 'this_week':
        return (
          `${lhs} >= DATE_TRUNC(CURRENT_DATE(), ISOWEEK)` +
          ` AND ${lhs} < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), ISOWEEK), INTERVAL 7 DAY)`
        );
      case 'last_week':
        return (
          `${lhs} >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), ISOWEEK), INTERVAL 7 DAY)` +
          ` AND ${lhs} < DATE_TRUNC(CURRENT_DATE(), ISOWEEK)`
        );
      case 'this_month':
        return (
          `${lhs} >= DATE_TRUNC(CURRENT_DATE(), MONTH)` +
          ` AND ${lhs} < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)`
        );
      case 'last_month':
        return (
          `${lhs} >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH)` +
          ` AND ${lhs} < DATE_TRUNC(CURRENT_DATE(), MONTH)`
        );
      case 'this_quarter':
        return (
          `${lhs} >= DATE_TRUNC(CURRENT_DATE(), QUARTER)` +
          ` AND ${lhs} < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), QUARTER), INTERVAL 3 MONTH)`
        );
      case 'last_quarter':
        return (
          `${lhs} >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), QUARTER), INTERVAL 3 MONTH)` +
          ` AND ${lhs} < DATE_TRUNC(CURRENT_DATE(), QUARTER)`
        );
      case 'this_year':
        return (
          `${lhs} >= DATE_TRUNC(CURRENT_DATE(), YEAR)` +
          ` AND ${lhs} < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 1 YEAR)`
        );
    }
  }
}
