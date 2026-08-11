import { BadRequestException } from '@nestjs/common';
import { categorizeFieldType } from '../../../data-marts/dto/schemas/field-type-category';
import { mcpOperatorNamesForInternal, mcpOperatorsForCategory } from './field-type-matrix';

const DATE_BUCKET_ERROR_CODES = new Set([
  'DATE_TRUNC_REQUIRES_DATE_COLUMN',
  'DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP',
  'DATE_TRUNC_INVALID_TIMEZONE',
  'DATE_TRUNC_COLUMN_IS_AGGREGATED',
]);

const NOT_SELECTED_CODES = new Set([
  'AGGREGATION_COLUMN_NOT_SELECTED',
  'DATE_TRUNC_COLUMN_NOT_SELECTED',
  'SORT_COLUMN_NOT_SELECTED',
]);

const AGG_NOT_ALLOWED_CODES = new Set([
  'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD',
  'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
  'DUPLICATE_AGGREGATION',
]);

/**
 * Every code the section branches below claim. The informative fallback subtracts
 * this set, so adding a new family means adding its codes HERE (next to the family
 * sets) — not editing a negative list at the bottom of the function. A code both
 * claimed by a branch and listed here renders exactly once.
 */
const RECOGNIZED_CODES = new Set([
  'FILTER_COLUMN_UNKNOWN',
  'PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART',
  'AGGREGATION_REQUIRES_COLUMN_CONFIG',
  'JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG',
  'JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE',
  'UNIQUE_COUNT_FILTER_UNSUPPORTED',
  'UNIQUE_COUNT_AGGREGATION_UNSUPPORTED',
  'UNIQUE_COUNT_DATE_TRUNC_UNSUPPORTED',
  'UNIQUE_COUNT_COLUMN_NOT_PROJECTABLE',
  'HAVING_FILTER_NOT_AGGREGATED',
  'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
  'INVALID_OPERATOR_FOR_TYPE',
  ...NOT_SELECTED_CODES,
  ...AGG_NOT_ALLOWED_CODES,
  ...DATE_BUCKET_ERROR_CODES,
]);

interface ValidatorErrorEntry {
  code?: string;
  column?: string;
  /** Set by the codes whose explanation is data-dependent (which source, and why it failed). */
  message?: string;
  /** OUTPUT_COLUMN_NAME_COLLISION names the colliding OUTPUT name here, not in `column`. */
  label?: string;
  function?: string;
  type?: string;
  operator?: string;
  aliasPath?: string;
  timeZone?: string;
}

/**
 * Translates the structured errors that OutputControlsValidatorService packs
 * into a BadRequestException (`{ message, details: { errors: [...] } }`) into
 * agent-actionable guidance. Shared by query_data_mart (which wraps the result
 * in a structured tool error) and the report tools (which re-throw it as a
 * BadRequestException) — without this, only `error.message` survives to the MCP
 * client and the codes/columns in `details.errors` are silently dropped.
 *
 * The validator reports EVERY problem in one errors array; every recognized
 * family is surfaced in one combined message so the caller fixes them all in
 * one retry instead of discovering one class per (billable) round-trip. The
 * returned `code` is the first (highest-priority) family that matched.
 *
 * Returns null when the exception carries no recognized validation errors; the
 * caller falls back to its own generic handling.
 */
export function translateOutputControlsError(
  err: BadRequestException
): { code: string; message: string } | null {
  const body = err.getResponse() as Record<string, unknown> | undefined;
  const errors = (body?.['details'] as Record<string, unknown> | undefined)?.['errors'] as
    | ValidatorErrorEntry[]
    | undefined;

  const sections: { code: string; message: string }[] = [];

  // Wrong field name — point at the schema.
  if (errors?.some(e => e.code === 'FILTER_COLUMN_UNKNOWN')) {
    sections.push({
      code: 'field_not_found',
      message: `${err.message}. Call get_data_mart_details_by_id to get this data mart's exact field names (including joined/blended fields) and use them verbatim; never guess or invent field names.`,
    });
  }

  // slices are pre-join filters; on a non-blended data mart they don't apply.
  if (errors?.some(e => e.code === 'PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART')) {
    sections.push({
      code: 'slices_not_applicable',
      message:
        'This data mart has no joined/blended sources, so slices (pre-join filters) do not apply. Move these predicates to "filters" and retry.',
    });
  }

  // Aggregations with fields ['*'] — the validator needs an explicit projection.
  if (errors?.some(e => e.code === 'AGGREGATION_REQUIRES_COLUMN_CONFIG')) {
    sections.push({
      code: 'fields_required_for_aggregation',
      message:
        "Aggregations require an explicit column selection: replace fields ['*'] with the exact field list — every aggregated field plus the group-by dimensions — and retry.",
    });
  }

  // A joined Data Mart's Unique Count with fields ['*'] — the blended builder needs a projection.
  if (errors?.some(e => e.code === 'JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG')) {
    sections.push({
      code: 'fields_required_for_joined_unique_count',
      message:
        "This report counts the unique records of a JOINED Data Mart, which requires an explicit column selection: replace fields ['*'] with the exact field list the report should show and retry.",
    });
  }

  // A joined source can no longer produce its Unique Count (its key is gone, or it left the join
  // tree). The report's Unique Count selection is not a parameter of any report tool, so there is
  // no edit to retry — pointing at "fields"/"sort" would loop the model over a pseudo-field those
  // never held. Name the one move that exists instead: a human fixes it in the OWOX UI.
  const unavailableUniqueCounts =
    errors?.filter(e => e.code === 'JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE') ?? [];
  if (unavailableUniqueCounts.length > 0) {
    const detail = [
      ...new Set(unavailableUniqueCounts.map(e => e.message ?? e.aliasPath).filter(Boolean)),
    ].join(' ');
    sections.push({
      code: 'joined_unique_count_unavailable',
      message: `${detail} A report's Unique Count selection cannot be changed through this tool, so retrying will not help: tell the user to open the report in OWOX and clear that source from its Unique Count selection, or to restore the joined Data Mart's Primary Key.`,
    });
  }

  // A filter (or slice) on a Unique Count metric. The metric exists and can be selected and sorted
  // by, so re-fetching the schema teaches the agent nothing — the validator's message is the only
  // text naming the real reason, and the fallback would discard it.
  const uniqueCountFilters =
    errors?.filter(e => e.code === 'UNIQUE_COUNT_FILTER_UNSUPPORTED') ?? [];
  if (uniqueCountFilters.length > 0) {
    const detail = [
      ...new Set(uniqueCountFilters.map(e => e.message ?? e.column).filter(Boolean)),
    ].join(' ');
    sections.push({
      code: 'unique_count_filter_unsupported',
      message: `${detail} Drop that filter (and any slice on the same metric) and retry; to narrow the report, filter on a column of the Data Mart instead. The field name is correct, so do not re-fetch the schema.`,
    });
  }

  const uniqueCountClauses =
    errors?.filter(
      e =>
        e.code === 'UNIQUE_COUNT_AGGREGATION_UNSUPPORTED' ||
        e.code === 'UNIQUE_COUNT_DATE_TRUNC_UNSUPPORTED'
    ) ?? [];
  if (uniqueCountClauses.length > 0) {
    const detail = [
      ...new Set(uniqueCountClauses.map(e => e.message ?? e.column).filter(Boolean)),
    ].join(' ');
    sections.push({
      code: 'unique_count_selection_only',
      message: `${detail} A Unique Count field can only be selected and sorted by. The field name is correct, so do not re-fetch the schema.`,
    });
  }

  // The report tools carry no Unique Count parameter, so unlike query_data_mart there is no
  // place to move the field to — say that instead of letting the model retry the same list.
  const unprojectableUniqueCounts =
    errors?.filter(e => e.code === 'UNIQUE_COUNT_COLUMN_NOT_PROJECTABLE') ?? [];
  if (unprojectableUniqueCounts.length > 0) {
    const detail = [
      ...new Set(unprojectableUniqueCounts.map(e => e.message ?? e.column).filter(Boolean)),
    ].join(' ');
    sections.push({
      code: 'unique_count_not_reportable',
      message: `${detail} A report's Unique Count selection cannot be set over MCP — remove the field and retry, and tell the user to turn it on for this report in the OWOX Data Marts UI. It IS available in query_data_mart.`,
    });
  }

  // Field name is correct but missing from `fields` — a re-fetch would loop the model; fix is to add it.
  const missing = errors?.filter(e => NOT_SELECTED_CODES.has(e.code ?? '')) ?? [];
  if (missing.length > 0) {
    const cols = [...new Set(missing.map(e => e.column).filter(Boolean))].join(', ');
    sections.push({
      code: 'field_not_selected',
      message: `Field(s) referenced by aggregations, date_buckets, or sort but missing from "fields"${cols ? `: ${cols}` : ''}. Every aggregated, bucketed, or sorted field must also be listed in "fields". Add ${cols || 'them'} to "fields" and retry — the field name(s) are correct, so do not re-fetch the schema.`,
    });
  }

  // Output controls reject this aggregate on this field (or it's a duplicate) — name field+function.
  const rejected = errors?.filter(e => AGG_NOT_ALLOWED_CODES.has(e.code ?? '')) ?? [];
  if (rejected.length > 0) {
    const detail = [
      ...new Set(
        rejected.map(e => (e.function && e.column ? `${e.function}(${e.column})` : e.column))
      ),
    ]
      .filter(Boolean)
      .join(', ');
    sections.push({
      code: 'aggregation_not_allowed',
      message: `Aggregation not permitted on the requested field(s)${detail ? `: ${detail}` : ''}. This data mart's output controls restrict which aggregate functions each field allows (or the same field+function was requested twice). Choose a different aggregation, or ask an admin to enable it — the field name(s) are correct, so do not re-fetch the schema.`,
    });
  }

  // A stored HAVING rule (UI-created; not expressible over MCP) lost its matching
  // aggregation. Without recovery guidance this dead-ends: the agent can neither
  // see the rule nor re-create it, so name both ways out of the stuck state.
  const havingOrphans = errors?.filter(e => e.code === 'HAVING_FILTER_NOT_AGGREGATED') ?? [];
  if (havingOrphans.length > 0) {
    const rules = havingOrphans
      .map(e => (e.function && e.column ? `${e.function}(${e.column})` : e.column))
      .filter(Boolean)
      .join(', ');
    sections.push({
      code: 'having_filter_not_aggregated',
      message: `This report carries a stored post-aggregation (HAVING) constraint${rules ? ` on ${rules}` : ''} whose aggregation is no longer configured. It was created in the OWOX UI and cannot be expressed over MCP. Either re-add the matching aggregation, or pass filters: [] to clear the stored constraint together with the row filters, then re-apply the filters you want.`,
    });
  }

  // A HAVING constraint on a joined COUNT DISTINCT / SUM / AVG: those metrics are
  // computed in a separate "sleeve" pass, which HAVING is not routed through yet, so the
  // combination is rejected rather than filtered on a stale value. This fires on reports that
  // ran fine before, and for an agent this text is the only recovery signal — name the rule and
  // both ways out.
  const sleeveHaving =
    errors?.filter(e => e.code === 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED') ?? [];
  if (sleeveHaving.length > 0) {
    const rules = sleeveHaving
      .map(e => (e.function && e.column ? `${e.function}(${e.column})` : e.column))
      .filter(Boolean)
      .join(', ');
    sections.push({
      code: 'having_on_joined_metric_not_supported',
      message: `A metric (HAVING) constraint${rules ? ` on ${rules}` : ''} targets a metric of a JOINED Data Mart (COUNT DISTINCT, SUM or AVG), which is computed at the report's own grain and cannot be filtered on yet. Filter on a column of the main Data Mart, or on a different metric, instead. If this constraint is stored on the report, pass filters: [] to clear it together with the row filters, then re-apply the ones you want.`,
    });
  }

  // Operator doesn't fit the field's type — name the field, its type, and the operators
  // that DO fit, so the model fixes the operator instead of re-fetching the schema.
  // The validator reports the INTERNAL (post-mapping) operator; the message must speak
  // the caller's MCP vocabulary instead. A slice carries an aliasPath (it runs pre-join
  // on the field's RAW type), so also point the model at the field's `sliceType`.
  const badOperators = errors?.filter(e => e.code === 'INVALID_OPERATOR_FOR_TYPE') ?? [];
  if (badOperators.length > 0) {
    const details = badOperators
      .map(e => {
        const category = categorizeFieldType(e.type ?? '');
        // Internal is_true/is_false only exist via the eq/neq boolean-value translation,
        // so seeing them on a NON-boolean column means the caller's VALUE was a boolean.
        if ((e.operator === 'is_true' || e.operator === 'is_false') && category !== 'boolean') {
          return `field '${e.column}' has type ${e.type}, but its filter got a boolean true/false value (eq/neq with a boolean targets boolean fields) — keep the operator and send a value matching the field's type instead (e.g. the string "true" or a number)`;
        }
        // eq/neq reported ON a boolean column means the value was NOT a real boolean
        // (e.g. the string "true") — eq/neq with a boolean value would have translated.
        if (category === 'boolean' && (e.operator === 'eq' || e.operator === 'neq')) {
          return `field '${e.column}' is boolean — use '${e.operator}' with a boolean true or false as the value (not a string)`;
        }
        const mcpNames = mcpOperatorNamesForInternal(e.operator ?? '');
        const operatorLabel =
          mcpNames.length === 1
            ? `operator '${mcpNames[0]}'`
            : mcpNames.length > 1
              ? `your ${mcpNames.join('/')} filter`
              : `operator '${e.operator}'`;
        const allowed = mcpOperatorsForCategory(category).join(', ');
        return `${operatorLabel} cannot apply to field '${e.column}' (type ${e.type ?? 'unknown'}); operators valid for this field: ${allowed}`;
      })
      .join('. ');
    const sliceHint = badOperators.some(e => e.aliasPath)
      ? 'A slice filters a joined field on its PRE-JOIN values, so use an operator valid for that field’s "sliceType" from get_data_mart_details, not its blended-result "type". '
      : '';
    sections.push({
      code: 'invalid_operator',
      message: `Filter/slice operator does not fit the field's type — ${details}. ${sliceHint}The field name(s) are correct, so do not re-fetch the schema; change the operator (or value) and retry.`,
    });
  }

  // date_buckets misuse — each variant names the field and the exact fix.
  const dateBucketIssues = errors?.filter(e => DATE_BUCKET_ERROR_CODES.has(e.code ?? '')) ?? [];
  if (dateBucketIssues.length > 0) {
    const details = dateBucketIssues
      .map(e => {
        switch (e.code) {
          case 'DATE_TRUNC_REQUIRES_DATE_COLUMN':
            return `field '${e.column}' (type ${e.type}) is not a date/timestamp — date_buckets only apply to date-category fields; bucket a date field or drop this bucket`;
          case 'DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP':
            return `field '${e.column}' (type ${e.type}) has no time-of-day component — remove time_zone for this bucket (it only applies to TIMESTAMP/DATETIME fields)`;
          case 'DATE_TRUNC_INVALID_TIMEZONE':
            return `'${e.timeZone}' is not a valid IANA time zone for field '${e.column}' — use e.g. "Europe/Kyiv" or omit time_zone`;
          case 'DATE_TRUNC_COLUMN_IS_AGGREGATED':
            return `field '${e.column}' is both aggregated and date-bucketed — a field can be one or the other; drop one of the two`;
          default:
            return `date bucket on '${e.column}' is invalid`;
        }
      })
      .join('. ');
    sections.push({
      code: 'invalid_date_bucket',
      message: `Invalid date_buckets — ${details}. The field name(s) are correct, so do not re-fetch the schema.`,
    });
  }

  // Codes no branch above recognizes still get named — no current or future
  // validator code is ever fully opaque to the MCP client. Appended as the last
  // section so recognized families keep their targeted guidance first.
  const unrecognized = errors?.filter(e => !RECOGNIZED_CODES.has(e.code ?? '')) ?? [];
  if (unrecognized.length > 0) {
    const detail = [
      ...new Set(
        unrecognized.map(e => {
          const named = e.column ?? e.label;
          return named ? `${e.code} (${named})` : e.code;
        })
      ),
    ]
      .filter(Boolean)
      .join(', ');
    if (detail) {
      sections.push({
        code: 'output_controls_invalid',
        message: `${err.message}: ${detail}. Fix the named output controls and retry; call get_data_mart_details_by_id if you need the field types.`,
      });
    }
  }

  if (sections.length === 0) return null;
  return {
    code: sections[0].code,
    message: sections.map(s => s.message).join(' ALSO: '),
  };
}

/**
 * Report-tool flavor: rethrows a validator BadRequestException with the
 * translated, agent-actionable message (falling back to the original error
 * when nothing is recognized). Wrap facade calls with it so add_report and
 * update_report surface the same guidance query_data_mart gives.
 */
export function rethrowTranslatedOutputControlsError(err: unknown): never {
  if (err instanceof BadRequestException) {
    const translated = translateOutputControlsError(err);
    if (translated) {
      throw new BadRequestException(translated.message);
    }
  }
  throw err;
}
