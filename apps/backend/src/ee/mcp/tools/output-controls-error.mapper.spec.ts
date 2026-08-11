import { BadRequestException } from '@nestjs/common';
import {
  rethrowTranslatedOutputControlsError,
  translateOutputControlsError,
} from './output-controls-error.mapper';

function validatorError(errors: Array<Record<string, unknown>>): BadRequestException {
  return new BadRequestException({
    message: 'Output controls validation failed',
    details: { errors },
  });
}

describe('translateOutputControlsError', () => {
  it('translates FILTER_COLUMN_UNKNOWN into schema-lookup guidance', () => {
    const translated = translateOutputControlsError(
      validatorError([{ code: 'FILTER_COLUMN_UNKNOWN', column: 'bad_col' }])
    );
    expect(translated).toMatchObject({ code: 'field_not_found' });
    expect(translated?.message).toContain('get_data_mart_details_by_id');
  });

  it('translates AGGREGATION_REQUIRES_COLUMN_CONFIG into a fields-list fix', () => {
    const translated = translateOutputControlsError(
      validatorError([{ code: 'AGGREGATION_REQUIRES_COLUMN_CONFIG' }])
    );
    expect(translated).toMatchObject({ code: 'fields_required_for_aggregation' });
    expect(translated?.message).toContain("fields ['*']");
  });

  it('translates JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG into a fields-list fix (#6792)', () => {
    const translated = translateOutputControlsError(
      validatorError([
        {
          code: 'JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG',
          message: 'A joined Data Mart’s Unique Count requires an explicit column selection.',
        },
      ])
    );
    expect(translated).toMatchObject({ code: 'fields_required_for_joined_unique_count' });
    expect(translated?.message).toContain("fields ['*']");
    // The code is in RECOGNIZED_CODES, so the generic fallback must not repeat it.
    expect(translated?.message).not.toContain('JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG');
  });

  it('translates JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE naming a remedy the tool can perform (#6792)', () => {
    const translated = translateOutputControlsError(
      validatorError([
        {
          code: 'JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE',
          aliasPath: 'orders',
          message:
            'The joined Data Mart "Orders" cannot supply its Unique Count: it has no primary key.',
        },
      ])
    );
    expect(translated).toMatchObject({ code: 'joined_unique_count_unavailable' });
    expect(translated?.message).toContain('Orders');
    expect(translated?.message).toContain('Unique Count');
    // The Unique Count selection is not a parameter of any report tool, so telling the model to
    // edit `fields`/`sort` sends it round a loop it cannot exit — the pseudo-field was never there.
    expect(translated?.message).not.toContain('"fields"');
    expect(translated?.message).not.toContain('"sort"');
    expect(translated?.message).toContain('cannot be changed');
    // The code is in RECOGNIZED_CODES, so the generic fallback must not repeat it.
    expect(translated?.message).not.toContain('JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE');
  });

  it('translates UNIQUE_COUNT_FILTER_UNSUPPORTED into a drop-the-filter fix (#6792)', () => {
    const translated = translateOutputControlsError(
      validatorError([
        {
          code: 'UNIQUE_COUNT_FILTER_UNSUPPORTED',
          column: 'orders__unique_count',
          message:
            '"orders__unique_count" is a Unique Count metric: it can be selected and sorted by, but not filtered or sliced. Remove the filter on it.',
        },
      ])
    );
    expect(translated).toMatchObject({ code: 'unique_count_filter_unsupported' });
    // The validator's own message is the only text naming WHY — the fallback drops it.
    expect(translated?.message).toContain('selected and sorted by, but not filtered');
    expect(translated?.message).toContain('orders__unique_count');
    // The code is in RECOGNIZED_CODES, so the generic fallback must not repeat it.
    expect(translated?.message).not.toContain('UNIQUE_COUNT_FILTER_UNSUPPORTED');
  });

  // Without their own sections these fall back to the generic handler, which repeats a raw code at
  // a model that has no way to act on it.
  it.each([
    ['UNIQUE_COUNT_AGGREGATION_UNSUPPORTED', 'unique_count_selection_only'],
    ['UNIQUE_COUNT_DATE_TRUNC_UNSUPPORTED', 'unique_count_selection_only'],
    ['UNIQUE_COUNT_COLUMN_NOT_PROJECTABLE', 'unique_count_not_reportable'],
  ])('translates %s into %s (#6792)', (code, expected) => {
    const translated = translateOutputControlsError(
      validatorError([
        { code, column: 'orders__unique_count', message: '"orders__unique_count" is a metric.' },
      ])
    );

    expect(translated).toMatchObject({ code: expected });
    expect(translated?.message).toContain('orders__unique_count');
    expect(translated?.message).not.toContain(code);
  });

  it('tells the model a report cannot carry a Unique Count it selected in fields', () => {
    const translated = translateOutputControlsError(
      validatorError([
        { code: 'UNIQUE_COUNT_COLUMN_NOT_PROJECTABLE', column: 'orders__unique_count' },
      ])
    );

    expect(translated?.message).toContain('remove the field');
    expect(translated?.message).toContain('query_data_mart');
  });

  it('translates NOT_SELECTED codes naming the columns, without a schema re-fetch hint', () => {
    const translated = translateOutputControlsError(
      validatorError([{ code: 'AGGREGATION_COLUMN_NOT_SELECTED', column: 'revenue' }])
    );
    expect(translated).toMatchObject({ code: 'field_not_selected' });
    expect(translated?.message).toContain('revenue');
    expect(translated?.message).toContain('do not re-fetch the schema');
  });

  it('translates HAVING_FILTER_NOT_AGGREGATED with both ways out of the stuck state', () => {
    const translated = translateOutputControlsError(
      validatorError([{ code: 'HAVING_FILTER_NOT_AGGREGATED', column: 'revenue', function: 'SUM' }])
    );
    expect(translated).toMatchObject({ code: 'having_filter_not_aggregated' });
    expect(translated?.message).toContain('SUM(revenue)');
    // The stored rule is invisible and inexpressible over MCP, so the message
    // must name both recoveries: re-add the aggregation or clear via filters: [].
    expect(translated?.message).toContain('re-add the matching aggregation');
    expect(translated?.message).toContain('filters: []');
  });

  it('translates HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED naming the rule and both ways out', () => {
    const translated = translateOutputControlsError(
      validatorError([
        {
          code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
          column: 'hitId',
          function: 'COUNT_DISTINCT',
        },
      ])
    );
    expect(translated).toMatchObject({ code: 'having_on_joined_metric_not_supported' });
    expect(translated?.message).toContain('COUNT_DISTINCT(hitId)');
    expect(translated?.message).toMatch(/joined data mart/i);
    // The rule may be stored on the report and invisible over MCP — name both recoveries.
    expect(translated?.message).toContain('a different metric');
    expect(translated?.message).toContain('filters: []');
    // The code is in RECOGNIZED_CODES, so the generic fallback must not repeat it.
    expect(translated?.message).not.toContain('HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED');
  });

  it('falls back to an informative translation naming unrecognized codes and columns', () => {
    const translated = translateOutputControlsError(
      validatorError([
        { code: 'OUTPUT_COLUMN_NAME_COLLISION', label: 'channel' },
        { code: 'PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG' },
      ])
    );
    expect(translated).toMatchObject({ code: 'output_controls_invalid' });
    expect(translated?.message).toContain('OUTPUT_COLUMN_NAME_COLLISION (channel)');
    expect(translated?.message).toContain('PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG');
  });

  it('translates date-bucket misuse with a per-variant fix instead of the generic fallback', () => {
    const translated = translateOutputControlsError(
      validatorError([
        { code: 'DATE_TRUNC_REQUIRES_DATE_COLUMN', column: 'channel', type: 'STRING' },
        { code: 'DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP', column: 'day', type: 'DATE' },
      ])
    );
    expect(translated).toMatchObject({ code: 'invalid_date_bucket' });
    expect(translated?.message).toContain("'channel'");
    expect(translated?.message).toContain('not a date/timestamp');
    expect(translated?.message).toContain('remove time_zone');
  });

  it('speaks the MCP vocabulary for invalid operators (internal relative_date → preset names)', () => {
    const translated = translateOutputControlsError(
      validatorError([
        {
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'session_time',
          type: 'TIME',
          operator: 'relative_date',
        },
      ])
    );
    expect(translated).toMatchObject({ code: 'invalid_operator' });
    expect(translated?.message).not.toContain("'relative_date'");
    expect(translated?.message).toContain('this_week');
    expect(translated?.message).toContain('in_last_n_days');
  });

  it('explains a boolean value on a non-boolean field instead of naming internal is_true', () => {
    const translated = translateOutputControlsError(
      validatorError([
        {
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'utm_source',
          type: 'STRING',
          operator: 'is_true',
        },
      ])
    );
    expect(translated).toMatchObject({ code: 'invalid_operator' });
    expect(translated?.message).toContain('boolean true/false value');
    expect(translated?.message).not.toContain("operator 'is_true'");
  });

  it('combines every recognized family into one message (first family sets the code)', () => {
    const translated = translateOutputControlsError(
      validatorError([
        {
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'revenue',
          type: 'FLOAT',
          operator: 'contains',
        },
        { code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD', column: 'name', function: 'SUM' },
        { code: 'SORT_COLUMN_NOT_SELECTED', column: 'ts' },
      ])
    );
    expect(translated).toMatchObject({ code: 'field_not_selected' });
    expect(translated?.message).toContain("'contains'");
    expect(translated?.message).toContain('SUM(name)');
    expect(translated?.message).toContain('missing from "fields"');
  });

  it('returns null for a BadRequestException without structured validation errors', () => {
    expect(translateOutputControlsError(new BadRequestException('plain message'))).toBeNull();
    expect(
      translateOutputControlsError(
        new BadRequestException({ message: 'shaped but empty', details: { errors: [] } })
      )
    ).toBeNull();
  });
});

describe('rethrowTranslatedOutputControlsError', () => {
  it('rethrows a recognized validator error with the translated message', () => {
    const err = validatorError([
      { code: 'PRE_JOIN_FILTERS_REQUIRE_JOINED_DATA_MART', column: 'source' },
    ]);
    expect(() => rethrowTranslatedOutputControlsError(err)).toThrow(BadRequestException);
    expect(() => rethrowTranslatedOutputControlsError(err)).toThrow(
      /no joined\/blended sources.*Move these predicates to "filters"/
    );
  });

  it('rethrows unrecognized errors unchanged', () => {
    const plain = new Error('boom');
    expect(() => rethrowTranslatedOutputControlsError(plain)).toThrow(plain);
    const unrecognized = new BadRequestException('name is required');
    expect(() => rethrowTranslatedOutputControlsError(unrecognized)).toThrow('name is required');
  });
});
