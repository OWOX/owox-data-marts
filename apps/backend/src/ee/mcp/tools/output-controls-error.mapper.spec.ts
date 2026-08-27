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

  // An agent hits this far more often than the aggregation twin: nothing in its own request
  // mentions an aggregation, so the field that grouped the report has to be named back to it.
  it('translates CALCULATED_FIELD_FILTER_REQUIRES_COLUMN_CONFIG into a fields-list fix naming the field', () => {
    const result = translateOutputControlsError(
      validatorError([
        {
          code: 'CALCULATED_FIELD_FILTER_REQUIRES_COLUMN_CONFIG',
          column: 'ctr',
          message: 'unused',
        },
      ])
    );

    expect(result).not.toBeNull();
    const text = JSON.stringify(result);
    expect(text).toContain('fields_required_for_calculated_field_filter');
    expect(text).toContain('ctr');
    // The code is in RECOGNIZED_CODES, so the generic fallback must not repeat it.
    expect(text).not.toContain('CALCULATED_FIELD_FILTER_REQUIRES_COLUMN_CONFIG');
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

  // A LONE entry, deliberately: this file subtracts RECOGNIZED_CODES from the
  // informative fallback, so a code no branch claims makes the whole function return null and the
  // agent gets a bare 400 with no guidance at all. The other date-bucket codes cannot show that —
  // they are already claimed, and would carry an unclaimed neighbour through on their own section.
  it('translates a time zone on a calculated field into a drop-the-time-zone fix', () => {
    const translated = translateOutputControlsError(
      validatorError([
        {
          code: 'DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD',
          column: 'visit_moment',
          timeZone: 'America/New_York',
        },
      ])
    );
    expect(translated).toMatchObject({ code: 'invalid_date_bucket' });
    expect(translated?.message).toContain("'visit_moment'");
    expect(translated?.message).toContain('Calculated Field');
    // The recovery: the bucket itself is fine, only the zone has to go.
    expect(translated?.message).toContain('time_zone');
    // Claimed, so the fallback must not repeat the raw code at the model.
    expect(translated?.message).not.toContain('DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD');
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

  // The schema tool now publishes a Calculated Field with an EMPTY allowedAggregations
  // set, so reaching any of these means the agent still treated an already-aggregated value as an
  // ordinary column. Untranslated, each one surfaced as a bare code with no way out.
  describe('calculated fields', () => {
    it('translates AGGREGATION_ON_CALCULATED_FIELD into "it is already aggregated"', () => {
      const translated = translateOutputControlsError(
        validatorError([
          {
            code: 'AGGREGATION_ON_CALCULATED_FIELD',
            column: 'ctr',
            message: '`ctr` is a calculated field and is already aggregated.',
          },
        ])
      );
      expect(translated).toMatchObject({ code: 'aggregation_on_calculated_field' });
      expect(translated?.message).toContain('ctr');
      expect(translated?.message).toContain('ALREADY aggregated');
      expect(translated?.message).toContain('do not re-fetch the schema');
      // Claimed by a branch, so the generic fallback must not repeat the raw code.
      expect(translated?.message).not.toContain('AGGREGATION_ON_CALCULATED_FIELD');
    });

    it('translates CALCULATED_FIELD_AS_DIMENSION into "drop the date bucket"', () => {
      const translated = translateOutputControlsError(
        validatorError([{ code: 'CALCULATED_FIELD_AS_DIMENSION', column: 'ctr' }])
      );
      expect(translated).toMatchObject({ code: 'calculated_field_as_dimension' });
      expect(translated?.message).toContain('date_bucket');
      expect(translated?.message).not.toContain('CALCULATED_FIELD_AS_DIMENSION');
    });

    // Nothing the agent can change fixes a formula reading a column the Data Mart lost — the
    // guidance must name the human move, not send it round the retry loop.
    it('translates CALCULATED_FIELD_BROKEN_REFERENCES into a human-fix instruction', () => {
      const translated = translateOutputControlsError(
        validatorError([
          {
            code: 'CALCULATED_FIELD_BROKEN_REFERENCES',
            column: 'ctr',
            message: '`ctr` references `impressions`, which is gone from the Data Mart.',
          },
        ])
      );
      expect(translated).toMatchObject({ code: 'calculated_field_broken' });
      expect(translated?.message).toContain('impressions');
      expect(translated?.message).toContain('retrying will not help');
      expect(translated?.message).not.toContain('CALCULATED_FIELD_BROKEN_REFERENCES');
    });

    // The one filter shape still refused, and it shares its section with the ordinary joined
    // metric's — same sleeve, same reason. Two sections would hand an agent that hit both two
    // explanations of one rule. It carries no `function`, so the rule is named by column alone.
    it('translates HAVING_ON_BLENDED_SLEEVE_CALCULATED_FIELD_NOT_SUPPORTED as the joined-metric rule', () => {
      const translated = translateOutputControlsError(
        validatorError([
          { code: 'HAVING_ON_BLENDED_SLEEVE_CALCULATED_FIELD_NOT_SUPPORTED', column: 'roi' },
        ])
      );
      expect(translated).toMatchObject({ code: 'having_on_joined_metric_not_supported' });
      expect(translated?.message).toContain('roi');
      expect(translated?.message).toContain('aggregates a joined source');
      // The mutation this catches: leaving the code out of RECOGNIZED_CODES and the branch, which
      // makes the informative fallback claim it and print the bare code — or, alone, return null.
      expect(translated?.message).not.toContain(
        'HAVING_ON_BLENDED_SLEEVE_CALCULATED_FIELD_NOT_SUPPORTED'
      );
    });

    // Pre-existing and unclaimed, but the shape is newly reachable: a slice on an
    // AGGREGATE-level Calculated Field. The rule carries no `function`, so it is named by column
    // alone, and the fix is a MOVE rather than a removal — which the informative fallback's
    // "call get_data_mart_details_by_id if you need the field types" never says.
    it('translates HAVING_FILTER_INVALID_PLACEMENT into "move it from slices to filters"', () => {
      const translated = translateOutputControlsError(
        validatorError([{ code: 'HAVING_FILTER_INVALID_PLACEMENT', column: 'ctr' }])
      );
      expect(translated).toMatchObject({ code: 'having_filter_invalid_placement' });
      expect(translated?.message).toContain('ctr');
      expect(translated?.message).toContain('"slices" to "filters"');
      // The mutation this catches: leaving the code out of RECOGNIZED_CODES and the branch. Alone
      // in the errors array it then makes this function return null and the agent gets a bare 400.
      expect(translated?.message).not.toContain('HAVING_FILTER_INVALID_PLACEMENT');
    });

    it('names the aggregate on a placement refusal that carries a function', () => {
      const translated = translateOutputControlsError(
        validatorError([
          { code: 'HAVING_FILTER_INVALID_PLACEMENT', column: 'amount', function: 'SUM' },
        ])
      );
      expect(translated?.message).toContain('SUM(amount)');
    });

    it('gives both sleeve refusals ONE section, not two', () => {
      const translated = translateOutputControlsError(
        validatorError([
          {
            code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
            column: 'orders__amount',
            function: 'SUM',
          },
          { code: 'HAVING_ON_BLENDED_SLEEVE_CALCULATED_FIELD_NOT_SUPPORTED', column: 'roi' },
        ])
      );
      expect(translated?.message).not.toContain('ALSO:');
      expect(translated?.message).toContain('SUM(orders__amount), roi');
    });

    // A JOINED Data Mart's calculated field is refused on every surface that can
    // name one, and `get_data_mart_details_by_id` omits it from `joined_fields` — so the informative
    // fallback, whose closing advice is "call get_data_mart_details_by_id if you need the field
    // types", reads as a lookup failure and invites a re-fetch instead of naming the boundary. The
    // validator's message is the only text naming the real reason (which Data Mart owns the formula,
    // and that only its real columns are readable here) and the fallback discards it. Unlike the
    // other refusals in this family this one carries no `level`: it is a boundary about WHOSE
    // formula it is, identical at both levels.
    it('translates JOINED_CALCULATED_FIELD_UNSUPPORTED without sending the agent back to the schema', () => {
      const translated = translateOutputControlsError(
        validatorError([
          {
            code: 'JOINED_CALCULATED_FIELD_UNSUPPORTED',
            column: 'orders__ctr',
            message:
              '`orders__ctr` is a calculated field of the joined Data Mart "Orders": its formula ' +
              'belongs to that Data Mart and is not available here, so this report can only read ' +
              'that Data Mart’s real columns. Remove it from the report, or add the same ' +
              'calculation to this Data Mart.',
          },
        ])
      );
      expect(translated).toMatchObject({ code: 'joined_calculated_field_unsupported' });
      expect(translated?.message).toContain('orders__ctr');
      expect(translated?.message).toContain('Orders');
      expect(translated?.message).toContain('real columns');
      expect(translated?.message).not.toContain('JOINED_CALCULATED_FIELD_UNSUPPORTED');
      expect(translated?.message).not.toContain('get_data_mart_details_by_id');
      // The schema tool now OMITS a joined calculated field, so telling the agent the
      // schema "still lists" it describes a published list it will not find the name in.
      expect(translated?.message).not.toContain('still lists');
      expect(translated?.message).toContain('joined_fields');
    });

    // The same field can be refused from `fields`, `filters`, `sort`, `aggregations` and
    // `date_buckets` at once — the validator raises ONE entry per column, so the guidance must
    // name every clause to remove it from rather than only the one the agent notices first.
    it('names every clause a joined calculated field has to leave', () => {
      const translated = translateOutputControlsError(
        validatorError([
          { code: 'JOINED_CALCULATED_FIELD_UNSUPPORTED', column: 'orders__ctr', message: 'x' },
          { code: 'JOINED_CALCULATED_FIELD_UNSUPPORTED', column: 'orders__roas', message: 'y' },
        ])
      );
      const message = translated?.message ?? '';
      expect(message).toContain('orders__ctr');
      expect(message).toContain('orders__roas');
      expect(message).toContain('date_buckets');
      expect(message.split(' ALSO: ')).toHaveLength(1);
    });

    // The same two codes now arrive with a `level`. A row-level formula is a
    // DIMENSION, so "it is ALREADY aggregated" / "it can never be a grouping dimension" are
    // false of it — and an agent told a false thing about a field spends its next turns acting
    // on it. Both arms are asserted, and each against the other's wording.
    describe('a row-level calculated field', () => {
      // The row-level aggregation refusal is GONE from the validator, so the arm that
      // explained it is gone from here — `calculated_field_aggregation_unsupported` no longer
      // exists. The code itself stays claimed whatever level rides on it: it is in
      // RECOGNIZED_CODES, so an unclaimed entry would be dropped by the fallback too and the
      // agent would get the bare 400 back with no guidance at all.
      it('never says a row-level aggregation is unsupported, and never drops the entry', () => {
        const translated = translateOutputControlsError(
          validatorError([
            { code: 'AGGREGATION_ON_CALCULATED_FIELD', column: 'session_key', level: 'column' },
          ])
        );
        expect(translated).not.toBeNull();
        expect(translated?.code).not.toBe('calculated_field_aggregation_unsupported');
        expect(translated?.message).toContain('session_key');
        expect(translated?.message).not.toContain('not supported yet');
        expect(translated?.message).not.toContain('AGGREGATION_ON_CALCULATED_FIELD');
      });

      // The row-level date-bucket refusal is GONE from the validator too, so the arm that
      // explained it is gone from here — `calculated_field_date_bucket_unsupported` no longer
      // exists, and "not supported yet" is now a FALSE thing to tell an agent about a field it can
      // bucket. The code itself stays claimed whatever level rides on it, for the same reason as
      // its neighbour and with a sharper consequence: `RECOGNIZED_CODES` subtracts it from the
      // informative fallback, so a lone entry no branch claimed makes the whole translation return
      // null and the agent gets the bare 400 with no guidance at all.
      it('never says a row-level date bucket is unsupported, and never drops the entry', () => {
        const translated = translateOutputControlsError(
          validatorError([
            { code: 'CALCULATED_FIELD_AS_DIMENSION', column: 'session_key', level: 'column' },
          ])
        );
        expect(translated).not.toBeNull();
        expect(translated?.code).not.toBe('calculated_field_date_bucket_unsupported');
        expect(translated?.message).toContain('session_key');
        expect(translated?.message).not.toContain('not supported yet');
        expect(translated?.message).not.toContain('CALCULATED_FIELD_AS_DIMENSION');
      });

      // An entry carrying no level at all is the older wire shape, and aggregating is the
      // behaviour every such field had — same fallback `isAggregateLevel` gives everywhere else.
      it('reads an absent level as an aggregate', () => {
        const translated = translateOutputControlsError(
          validatorError([{ code: 'AGGREGATION_ON_CALCULATED_FIELD', column: 'ctr' }])
        );
        expect(translated).toMatchObject({ code: 'aggregation_on_calculated_field' });
        expect(translated?.message).toContain('ALREADY aggregated');
      });

      // No calculated-field code forks on `level` any more, so the guarantee to pin is
      // the opposite one: EVERY entry is claimed whatever level it carries, and they share the one
      // sentence rather than splitting into two that would say opposite things. A mixed array is
      // still the shape to assert it on — a filter written back onto either branch would drop the
      // level it excluded, and a dropped lone entry returns null.
      it('claims an entry whatever level it carries, in one section', () => {
        const translated = translateOutputControlsError(
          validatorError([
            { code: 'CALCULATED_FIELD_AS_DIMENSION', column: 'ctr', level: 'metric' },
            {
              code: 'CALCULATED_FIELD_AS_DIMENSION',
              column: 'session_key',
              level: 'column',
            },
          ])
        );
        const message = translated?.message ?? '';
        expect(message).toContain('ctr');
        expect(message).toContain('session_key');
        expect(message.split(' ALSO: ')).toHaveLength(1);
        expect(message).not.toContain('CALCULATED_FIELD_AS_DIMENSION');
      });
    });
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
