import { BadRequestException } from '@nestjs/common';

/**
 * Translates the structured errors that OutputControlsValidatorService packs
 * into a BadRequestException (`{ message, details: { errors: [...] } }`) into
 * agent-actionable guidance. Shared by query_data_mart (which wraps the result
 * in a structured tool error) and the report tools (which re-throw it as a
 * BadRequestException) — without this, only `error.message` survives to the MCP
 * client and the codes/columns in `details.errors` are silently dropped.
 *
 * Returns null when the exception carries no recognized validation errors; the
 * caller falls back to its own generic handling.
 */
export function translateOutputControlsError(
  err: BadRequestException
): { code: string; message: string } | null {
  const body = err.getResponse() as Record<string, unknown> | undefined;
  const errors = (body?.['details'] as Record<string, unknown> | undefined)?.['errors'] as
    | Array<{
        code?: string;
        column?: string;
        function?: string;
        type?: string;
        operator?: string;
        aliasPath?: string;
      }>
    | undefined;

  // Wrong field name — point at the schema.
  if (errors?.some(e => e.code === 'FILTER_COLUMN_UNKNOWN')) {
    return {
      code: 'field_not_found',
      message: `${err.message}. Call get_data_mart_details_by_id to get this data mart's exact field names (including joined/blended fields) and use them verbatim; never guess or invent field names.`,
    };
  }

  // slices are pre-join filters; on a non-blended data mart they don't apply.
  if (errors?.some(e => e.code === 'PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART')) {
    return {
      code: 'slices_not_applicable',
      message:
        'This data mart has no joined/blended sources, so slices (pre-join filters) do not apply. Move these predicates to "filters" and retry.',
    };
  }

  // Aggregations with fields ['*'] — the validator needs an explicit projection.
  if (errors?.some(e => e.code === 'AGGREGATION_REQUIRES_COLUMN_CONFIG')) {
    return {
      code: 'fields_required_for_aggregation',
      message:
        "Aggregations require an explicit column selection: replace fields ['*'] with the exact field list — every aggregated field plus the group-by dimensions — and retry.",
    };
  }

  // Field name is correct but missing from `fields` — a re-fetch would loop the model; fix is to add it.
  const notSelected = new Set([
    'AGGREGATION_COLUMN_NOT_SELECTED',
    'DATE_TRUNC_COLUMN_NOT_SELECTED',
    'SORT_COLUMN_NOT_SELECTED',
  ]);
  const missing = errors?.filter(e => notSelected.has(e.code ?? '')) ?? [];
  if (missing.length > 0) {
    const cols = [...new Set(missing.map(e => e.column).filter(Boolean))].join(', ');
    return {
      code: 'field_not_selected',
      message: `Field(s) referenced by aggregations, date_buckets, or sort but missing from "fields"${cols ? `: ${cols}` : ''}. Every aggregated, bucketed, or sorted field must also be listed in "fields". Add ${cols || 'them'} to "fields" and retry — the field name(s) are correct, so do not re-fetch the schema.`,
    };
  }

  // Output controls reject this aggregate on this field (or it's a duplicate) — name field+function.
  const aggNotAllowed = new Set([
    'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD',
    'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
    'DUPLICATE_AGGREGATION',
  ]);
  const rejected = errors?.filter(e => aggNotAllowed.has(e.code ?? '')) ?? [];
  if (rejected.length > 0) {
    const detail = [
      ...new Set(
        rejected.map(e => (e.function && e.column ? `${e.function}(${e.column})` : e.column))
      ),
    ]
      .filter(Boolean)
      .join(', ');
    return {
      code: 'aggregation_not_allowed',
      message: `Aggregation not permitted on the requested field(s)${detail ? `: ${detail}` : ''}. This data mart's output controls restrict which aggregate functions each field allows (or the same field+function was requested twice). Choose a different aggregation, or ask an admin to enable it — the field name(s) are correct, so do not re-fetch the schema.`,
    };
  }

  // A stored HAVING rule (UI-created; not expressible over MCP) lost its matching
  // aggregation. Without recovery guidance this dead-ends: the agent can neither
  // see the rule nor re-create it, so name both ways out of the stuck state.
  if (errors?.some(e => e.code === 'HAVING_FILTER_NOT_AGGREGATED')) {
    const rules = errors
      .filter(e => e.code === 'HAVING_FILTER_NOT_AGGREGATED')
      .map(e => (e.function && e.column ? `${e.function}(${e.column})` : e.column))
      .filter(Boolean)
      .join(', ');
    return {
      code: 'having_filter_not_aggregated',
      message: `This report carries a stored post-aggregation (HAVING) constraint${rules ? ` on ${rules}` : ''} whose aggregation is no longer configured. It was created in the OWOX UI and cannot be expressed over MCP. Either re-add the matching aggregation, or pass filters: [] to clear the stored constraint together with the row filters, then re-apply the filters you want.`,
    };
  }

  // Filter/slice operator not valid for the field's type. A slice carries an aliasPath (it runs
  // pre-join on the field's RAW type), so point the model at the field's `sliceType`.
  const badOperator = errors?.filter(e => e.code === 'INVALID_OPERATOR_FOR_TYPE') ?? [];
  if (badOperator.length > 0) {
    const detail = [
      ...new Set(
        badOperator.map(e =>
          e.operator && e.column
            ? `${e.operator} on ${e.column} (${e.type ?? 'unknown type'})`
            : e.column
        )
      ),
    ]
      .filter(Boolean)
      .join('; ');
    const hasSlice = badOperator.some(e => e.aliasPath);
    return {
      code: 'invalid_operator',
      message: `Operator not valid for the field's type: ${detail}. ${
        hasSlice
          ? 'A slice filters a joined field on its PRE-JOIN values, so use an operator valid for that field’s "sliceType" from get_data_mart_details, not its blended-result "type". '
          : ''
      }Choose an operator that matches the field type and retry.`,
    };
  }

  // Informative fallback: no specific branch matched, but the validator DID
  // report structured errors — append the codes and columns so no current or
  // future validator code is ever fully opaque to the MCP client. Specific
  // branches above stay reserved for cases needing real recovery guidance.
  if (errors && errors.length > 0) {
    const detail = [...new Set(errors.map(e => (e.column ? `${e.code} (${e.column})` : e.code)))]
      .filter(Boolean)
      .join(', ');
    if (detail) {
      return {
        code: 'output_controls_invalid',
        message: `${err.message}: ${detail}. Fix the named output controls and retry; call get_data_mart_details_by_id if you need the field types.`,
      };
    }
  }

  return null;
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
