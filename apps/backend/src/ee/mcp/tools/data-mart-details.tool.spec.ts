import type { McpDataMartsFacade } from '../../../data-marts/facades/mcp-data-marts.facade';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { GetDataMartDetailsTool } from './data-mart-details.tool';

describe('GetDataMartDetailsTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };
  const publicOrigin = {
    getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
  } as unknown as jest.Mocked<PublicOriginService>;

  it('returns enriched details with url and the operator matrix (with_joined_fields)', async () => {
    const detailsResult = {
      id: 'dm_1',
      name: 'Orders',
      description: 'Orders data mart',
      fields: [
        {
          name: 'order_date',
          type: 'DATE',
          description: 'Order date',
        },
        {
          name: 'utm_source',
          type: 'STRING',
          businessName: 'Traffic source',
          description: 'Marketing traffic source',
        },
      ],
      joinedFields: [
        {
          name: 'blended_org__orgName',
          type: 'STRING',
          description: 'Organization name',
          sourceDataMart: 'blended_org',
        },
      ],
      joins: [
        {
          aliasPath: 'blended_org',
          sourceDataMart: 'Orders',
          targetDataMart: 'blended_org',
          joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'id' }],
          description: 'Each order is placed by one organization',
        },
      ],
    };
    const facade = {
      getDataMartDetails: jest.fn().mockResolvedValue(detailsResult),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade, publicOrigin);

    const result = await tool.handler(
      { data_mart_id: 'dm_1', detail_level: 'with_joined_fields' },
      context
    );
    const sc = result.structuredContent as {
      id: string;
      url: string;
      joined_fields_included: boolean;
      fields: Array<Record<string, unknown>>;
      joined_fields: Array<Record<string, unknown>>;
      joins: Array<Record<string, unknown>>;
      operators_by_category: Record<string, string[]>;
    };

    expect(sc.id).toBe('dm_1');
    // Join edges pass through untouched — the relationship description IS the payload (#6780).
    expect(sc.joins).toEqual([
      {
        aliasPath: 'blended_org',
        sourceDataMart: 'Orders',
        targetDataMart: 'blended_org',
        joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'id' }],
        description: 'Each order is placed by one organization',
      },
    ]);
    expect(sc.url).toBe('https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup');
    expect(sc.joined_fields_included).toBe(true);
    // Governance defaults, not the full type menu: DATE → MIN/MAX, STRING → COUNT/COUNT_DISTINCT.
    expect(sc.fields[0]).toMatchObject({
      name: 'order_date',
      type: 'DATE',
      category: 'date',
      allowedAggregations: ['MIN', 'MAX'],
    });
    expect(sc.fields[1]).toMatchObject({
      name: 'utm_source',
      category: 'string',
      allowedAggregations: ['COUNT', 'COUNT_DISTINCT'],
    });
    // Joined fields without a governance restriction get the same type-derived defaults.
    expect(sc.joined_fields[0]).toMatchObject({
      name: 'blended_org__orgName',
      sourceDataMart: 'blended_org',
      category: 'string',
      allowedAggregations: ['COUNT', 'COUNT_DISTINCT'],
    });
    // Only categories present in this data mart appear in the operator matrix.
    expect(Object.keys(sc.operators_by_category).sort()).toEqual(['date', 'string']);
    expect(sc.operators_by_category['string']).toEqual(
      expect.arrayContaining(['eq', 'contains', 'starts_with', 'is_blank'])
    );
    expect(sc.operators_by_category['string']).not.toEqual(expect.arrayContaining(['gt']));
    expect(sc.operators_by_category['date']).toEqual(
      expect.arrayContaining(['before', 'after', 'between', 'in_last_n_days', 'this_month'])
    );

    expect(facade.getDataMartDetails).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      dataMartId: 'dm_1',
      includeJoinedFields: true,
      includeGrainCaveats: true,
    });
  });

  it('defaults to native fields and marks joined fields as omitted', async () => {
    const facade = {
      getDataMartDetails: jest.fn().mockResolvedValue({
        id: 'dm_1',
        name: 'Orders',
        description: 'Orders data mart',
        fields: [],
        joinedFields: [],
        joins: [],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade, publicOrigin);

    const result = await tool.handler({ data_mart_id: 'dm_1' }, context);

    expect(result.structuredContent).toMatchObject({
      joined_fields_included: false,
      joined_fields: [],
      joins: [],
    });
    expect(facade.getDataMartDetails).toHaveBeenCalledWith(
      expect.objectContaining({ includeJoinedFields: false })
    );
  });

  it('narrows a field with an explicit allowedAggregations override and enriches nested fields', async () => {
    const facade = {
      getDataMartDetails: jest.fn().mockResolvedValue({
        id: 'dm_2',
        name: 'Events',
        description: '',
        fields: [
          {
            name: 'revenue',
            type: 'FLOAT',
            allowedAggregations: ['SUM', 'P95'],
          },
          {
            name: 'payload',
            type: 'RECORD',
            fields: [{ name: 'payload.amount', type: 'INTEGER' }],
          },
          {
            name: 'tags',
            type: 'STRING',
            mode: 'REPEATED',
          },
          {
            name: 'items',
            type: 'RECORD',
            mode: 'REPEATED',
            fields: [{ name: 'items.sku', type: 'STRING' }],
          },
          {
            name: 'typed_items',
            type: 'ARRAY<STRUCT<sku STRING>>',
            fields: [{ name: 'typed_items.sku', type: 'STRING' }],
          },
        ],
        joinedFields: [
          {
            name: 'costs__spend',
            type: 'FLOAT',
            description: '',
            sourceDataMart: 'costs',
            allowedAggregations: ['SUM'],
          },
          {
            name: 'costs__locked',
            type: 'FLOAT',
            description: '',
            sourceDataMart: 'costs',
            allowedAggregations: [],
          },
          {
            // Deduplicated with COUNT_DISTINCT: blended type INTEGER, pre-join STRING.
            name: 'costs__campaign',
            type: 'INTEGER',
            sliceType: 'STRING',
            description: '',
            sourceDataMart: 'costs',
          },
          {
            name: 'costs__items',
            type: 'STRING',
            sliceType: 'ARRAY<STRING>',
            description: '',
            sourceDataMart: 'costs',
          },
        ],
        joins: [],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade, publicOrigin);

    const result = await tool.handler(
      { data_mart_id: 'dm_2', detail_level: 'with_joined_fields' },
      context
    );
    const sc = result.structuredContent as {
      fields: Array<Record<string, unknown>>;
      joined_fields: Array<Record<string, unknown>>;
      operators_by_category: Record<string, string[]>;
    };

    // Explicit override is preserved (already within the number menu).
    expect(sc.fields[0]).toMatchObject({ allowedAggregations: ['SUM', 'P95'] });
    // A non-repeated RECORD keeps its existing controls; its nested leaf is enriched separately.
    expect(sc.fields[1]).toMatchObject({ category: 'other', allowedAggregations: ['COUNT'] });
    expect((sc.fields[1].fields as Array<Record<string, unknown>>)[0]).toMatchObject({
      category: 'number',
      allowedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'],
    });
    expect(sc.fields[2]).toMatchObject({
      type: 'STRING',
      mode: 'REPEATED',
      allowedAggregations: [],
    });
    expect(sc.fields[2]).not.toHaveProperty('category');
    expect(sc.fields[3]).toMatchObject({
      type: 'RECORD',
      mode: 'REPEATED',
      allowedAggregations: [],
    });
    expect(sc.fields[3]).not.toHaveProperty('category');
    expect(sc.fields[3]).not.toHaveProperty('fields');
    expect(sc.fields[4]).toMatchObject({
      type: 'ARRAY<STRUCT<sku STRING>>',
      allowedAggregations: [],
    });
    expect(sc.fields[4]).not.toHaveProperty('category');
    expect(sc.fields[4]).not.toHaveProperty('fields');
    // Restricted joined field keeps its restriction.
    expect(sc.joined_fields[0]).toMatchObject({ allowedAggregations: ['SUM'] });
    // Explicit [] ("no aggregations allowed") must stay [], NOT fall back to type defaults —
    // the validator enforces the empty set, so advertising defaults would guarantee rejections.
    expect(sc.joined_fields[1]).toMatchObject({ allowedAggregations: [] });
    // A type-changing dedup: slices run on the PRE-join type, so the field gets its own
    // sliceCategory and that category joins the operator matrix.
    expect(sc.joined_fields[2]).toMatchObject({
      category: 'number',
      sliceCategory: 'string',
    });
    expect(sc.joined_fields[3]).toMatchObject({
      allowedAggregations: [],
    });
    expect(sc.joined_fields[3]).not.toHaveProperty('category');
    expect(sc.joined_fields[3]).not.toHaveProperty('sliceCategory');
    expect(Object.keys(sc.operators_by_category)).toEqual(
      expect.arrayContaining(['number', 'string'])
    );
    expect(sc.operators_by_category['other']).toEqual(['is_blank', 'is_not_blank']);
  });

  // A Calculated Field carries neither `aggregationRole` nor `allowedAggregations` — the
  // dialog that creates one deliberately sets neither — so governance falls back to the TYPE
  // defaults and a FLOAT metric was published as SUM/AVG/MIN/MAX-able under a description reading
  // "Use only these". The agent did the advertised thing and got a 400
  // AGGREGATION_ON_CALCULATED_FIELD. The web picker has always forced the empty set; this is the
  // same rule on the MCP surface.
  it('publishes a calculated field as non-aggregatable, and never ships its formula', async () => {
    const facade = {
      getDataMartDetails: jest.fn().mockResolvedValue({
        id: 'dm_1',
        name: 'Ads',
        description: '',
        fields: [
          { name: 'clicks', type: 'INTEGER' },
          {
            name: 'ctr',
            type: 'FLOAT',
            displayName: 'CTR, %',
            description: 'Clicks per impression.',
            // What the facade forwards after `prepareSchema`: the marker survives, the stored
            // formula does not.
            calculated: { level: 'metric' },
          },
        ],
        joinedFields: [],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade, publicOrigin);

    const result = await tool.handler({ data_mart_id: 'dm_1' }, context);
    const sc = result.structuredContent as { fields: Array<Record<string, unknown>> };

    // A plain FLOAT beside it still gets its type defaults — the empty set is the metric's alone.
    expect(sc.fields[0]).toMatchObject({
      name: 'clicks',
      allowedAggregations: ['SUM', 'AVG', 'MIN', 'MAX'],
    });
    expect(sc.fields[1]).toMatchObject({
      name: 'ctr',
      category: 'number',
      allowedAggregations: [],
      displayName: 'CTR, %',
      description: 'Clicks per impression.',
    });
    expect(JSON.stringify(sc.fields[1])).not.toContain('{{ref');
    expect(sc.fields[1].calculated).not.toHaveProperty('formula');
  });

  // On its own that empty set reads as a refusal, so agents recomputed the metric from its inputs
  // instead. The affordance has to be in the payload: the level's prose is in outputSchema, which
  // clients weight far below the data they are handed.
  it('tells the agent, in the payload, that an aggregate-level field is already computed', async () => {
    const facade = {
      getDataMartDetails: jest.fn().mockResolvedValue({
        id: 'dm_1',
        name: 'Ads',
        description: '',
        fields: [
          { name: 'revenue', type: 'FLOAT' },
          { name: 'roas', type: 'FLOAT', calculated: { level: 'metric' } },
          // No level at all — the case `isAggregateLevel` is spelled `!== 'column'` for. Without
          // it here, narrowing the emit to `level === 'metric'` passes every other spec.
          { name: 'legacy_ratio', type: 'FLOAT', calculated: {} },
          { name: 'ctr', type: 'FLOAT', calculated: { level: 'column' } },
        ],
        joinedFields: [],
      }),
    } as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade, publicOrigin);

    const result = await tool.handler({ data_mart_id: 'dm_1' }, context);
    const sc = result.structuredContent as { fields: Array<Record<string, unknown>> };

    expect(sc.fields[1]).toMatchObject({
      name: 'roas',
      allowedAggregations: [],
      usage:
        'Already computed by OWOX at the grain your query asks for: list it in "fields" and read ' +
        'the value. Do not recompute it from other fields, and do not name it in "aggregations".',
    });

    // A field carrying no level is an aggregate too — nothing backfills one, and aggregating is
    // what every such field always did.
    expect(sc.fields[2]).toMatchObject({ name: 'legacy_ratio', usage: expect.any(String) });

    // The contrast is the whole point: an ordinary field and a row-level formula are both things
    // the agent is SUPPOSED to aggregate, so a note on them would be noise that dulls the one
    // place it means something.
    expect(sc.fields[0]).not.toHaveProperty('usage');
    expect(sc.fields[3]).not.toHaveProperty('usage');
  });

  // The facade answers `grainCaveats` for any published calculated field whose formula reads a
  // joined Data Mart — #6926 refuses nothing, so the field is always one that was saved and is
  // now being warned about. The incident this feature exists for happened through exactly this call.
  describe('the caveat a join puts on a number', () => {
    // Shortened stand-in for the catalogue's sentence: this suite is about where the caveat lands
    // and how it is framed, never about the wording.
    const CAVEAT = 'A COUNT over `Costs` counts this Data Mart’s matched rows, not its own.';

    async function details(field: {
      fieldName: string;
      level?: string;
      caveat?: string;
    }): Promise<{ facade: jest.Mocked<McpDataMartsFacade>; out: Record<string, unknown> }> {
      const facade = {
        getDataMartDetails: jest.fn().mockResolvedValue({
          id: 'dm_1',
          name: 'Ads',
          description: '',
          fields: [
            {
              name: field.fieldName,
              type: 'FLOAT',
              ...(field.level !== undefined ? { calculated: { level: field.level } } : {}),
            },
          ],
          joinedFields: [],
          ...(field.caveat !== undefined
            ? { grainCaveats: { [field.fieldName]: field.caveat } }
            : {}),
        }),
      } as unknown as jest.Mocked<McpDataMartsFacade>;
      const tool = new GetDataMartDetailsTool(facade, publicOrigin);

      const result = await tool.handler({ data_mart_id: 'dm_1' }, context);
      const sc = result.structuredContent as { fields: Array<Record<string, unknown>> };
      return { facade, out: sc.fields[0] };
    }

    it('asks the facade for the caveats', async () => {
      const { facade } = await details({ fieldName: 'clicks' });
      expect(facade.getDataMartDetails).toHaveBeenCalledWith(
        expect.objectContaining({ includeGrainCaveats: true })
      );
    });

    it('appends the caveat to the usage note of an aggregate-level calculated field', async () => {
      const { out } = await details({ fieldName: 'roas', level: 'metric', caveat: CAVEAT });
      expect(out.usage).toContain('Already computed by OWOX');
      expect(out.usage).toContain(CAVEAT);
    });

    // The sentence names a fix to make in the formula, next to "do not recompute it": the agent
    // must be told the fix is not its to make, and that the number carries the caveat onward.
    it('frames the caveat as one to pass on, not a fix for the query', async () => {
      const { out } = await details({ fieldName: 'roas', level: 'metric', caveat: CAVEAT });
      expect(out.usage).toContain(
        'Caveat to pass on to the user with this number — the fix belongs in the Data Mart, not ' +
          `in your query: ${CAVEAT}`
      );
    });

    it('makes the framed caveat the whole usage note when the field is not aggregate-level', async () => {
      const { out } = await details({ fieldName: 'ratio', level: 'column', caveat: CAVEAT });
      expect(out.usage).toMatch(/^Caveat to pass on to the user/);
      expect(out.usage).toContain(CAVEAT);
    });

    it('leaves usage absent when there is no caveat and no aggregate level', async () => {
      const { out } = await details({ fieldName: 'clicks' });
      expect(out.usage).toBeUndefined();
    });
  });

  // This prose is the ONLY thing that tells an agent what a Calculated Field is,
  // and a stale sentence in it fails no other test while silently degrading every agent that
  // reads it. Both level texts are pinned verbatim so that editing either one is a visible
  // change in this file rather than a quiet change in a model's context.
  describe('the calculated-field prose an agent reads', () => {
    const AGGREGATE_AND_ROW_LEVEL_DESCRIPTION =
      '"metric" — the formula is ALREADY aggregated: select it by name and it is recomputed ' +
      'correctly at whatever grain your query asks for, including in a query that reads a joined ' +
      'Data Mart; it cannot be aggregated again (its allowedAggregations is empty), used as a ' +
      'group-by dimension, or given a date_bucket. This is also the meaning when the ' +
      'property is absent. "column" — the formula is row-level, so the field IS an ordinary ' +
      'dimension: select it by name and group by it exactly like a real column, including in a ' +
      'query that reads a joined Data Mart; it also accepts any aggregation listed in its own ' +
      'allowedAggregations (e.g. COUNT_DISTINCT), and applying one makes it a metric of that ' +
      'query rather than one of its grouping keys; when its declared type is DATE or TIMESTAMP it ' +
      'also takes a date_bucket, on the same rule a real date column follows. Filtering works at ' +
      'BOTH levels: a row-level field filters on its computed value like an ordinary column, and ' +
      'a metric filters on its aggregated value — but a metric filter needs the query to name ' +
      'its fields explicitly rather than relying on the default all-columns projection.';

    const publishedCalculatedSchema = () => {
      const tool = new GetDataMartDetailsTool({} as McpDataMartsFacade, publicOrigin);
      const fields = tool.outputSchema.fields as unknown as {
        element: { shape: Record<string, { description?: string; unwrap(): unknown }> };
      };
      return fields.element.shape.calculated;
    };

    const publishedLevelSchema = () => {
      const calculated = publishedCalculatedSchema().unwrap() as {
        shape: Record<string, { description?: string }>;
      };
      return calculated.shape.level;
    };

    it('describes the marker itself without claiming a level', () => {
      expect(publishedCalculatedSchema().description).toBe(
        'Present when this field is a Calculated Field: a value the Data Mart computes from a ' +
          'formula instead of reading it from a warehouse column. Its "level" says whether it ' +
          'behaves as a metric or as a dimension — read that before using the field. When ' +
          '"level" is absent the field is a metric; nothing backfills it, so every field defined ' +
          'before levels existed arrives without one.'
      );
    });

    it('publishes both level texts, verbatim', () => {
      expect(publishedLevelSchema().description).toBe(AGGREGATE_AND_ROW_LEVEL_DESCRIPTION);
    });

    // The two halves must disagree, and this widens the gap rather than closing it: the
    // row-level half now says the field can be aggregated, while the aggregate half still says
    // it cannot. A sentence claiming a row-level aggregation is unsupported would fail no other
    // test and would send every agent that reads it away from a query that works.
    it('tells an agent a row-level field CAN be grouped by AND aggregated, and an aggregate one neither', () => {
      const [aggregateHalf, rowLevelHalf] = (publishedLevelSchema().description ?? '').split(
        '"column" —'
      );

      expect(rowLevelHalf).toBeDefined();
      expect(aggregateHalf).toContain('used as a group-by dimension');
      expect(aggregateHalf).toContain('cannot be aggregated again');
      expect(rowLevelHalf).toContain('group by it');
      expect(rowLevelHalf).not.toContain('used as a group-by dimension');
      expect(rowLevelHalf).toContain(
        'accepts any aggregation listed in its own allowedAggregations'
      );
      expect(rowLevelHalf).not.toContain('cannot yet be aggregated');
      expect(rowLevelHalf).not.toContain('allowedAggregations is empty');
      // This PR ships filtering at BOTH levels — WHERE for a row-level field, HAVING for a
      // metric — and the validator's own spec accepts the metric case. A contract still saying
      // "refused at either level" makes an agent decline a query that works, or pull unfiltered
      // pages and filter them itself.
      expect(publishedLevelSchema().description).not.toContain('refused at either level');
      expect(aggregateHalf).not.toContain('or filtered on');
      // The bucket is lifted for a row-level field. While the sentence still refused one,
      // an agent either declined a request it could serve or bucketed some other field and
      // answered at the wrong grain without saying so.
      expect(rowLevelHalf).not.toContain('cannot yet be bucketed by date');
      expect(rowLevelHalf).toContain('takes a date_bucket');
      // ...but only on a DATE/TIMESTAMP declaration, exactly as a real column. Advertising the
      // bucket unconditionally is the same defect pointed the other way.
      expect(rowLevelHalf).toContain('DATE or TIMESTAMP');
      // Nothing else was lifted with it: filtering is still refused, and at BOTH levels, so no
      // clause here may read as temporary.
      expect(rowLevelHalf).toContain('Filtering');
      expect(rowLevelHalf).not.toContain('yet');
      // An aggregate-level field is refused a bucket permanently — it is never a grouping key —
      // so the lift must not have leaked across the split.
      expect(aggregateHalf).toContain('or given a date_bucket');
      expect(aggregateHalf).not.toContain('DATE or TIMESTAMP');
      // A calculated field works on a joined report as of this branch, and only the row-level
      // half said so; silence on this half reads to an agent as "not supported here".
      expect(aggregateHalf).toContain('including in a query that reads a joined Data Mart');
    });

    // The refusal is reversed for the row-level level ONLY: the mechanism that renders
    // COUNT_DISTINCT over a formula now exists, so the field is advertised with the governance
    // menu the validator will actually enforce — resolved from its DECLARED type, since a
    // calculated field carries no aggregationRole and no override of its own.
    it('publishes the governance menu for a row-level field', async () => {
      const facade = {
        getDataMartDetails: jest.fn().mockResolvedValue({
          id: 'dm_1',
          name: 'Sessions',
          description: '',
          fields: [
            { name: 'session_id', type: 'STRING' },
            { name: 'session_key', type: 'STRING', calculated: { level: 'column' } },
          ],
          joinedFields: [],
        }),
      } as unknown as jest.Mocked<McpDataMartsFacade>;
      const tool = new GetDataMartDetailsTool(facade, publicOrigin);

      const result = await tool.handler({ data_mart_id: 'dm_1' }, context);
      const sc = result.structuredContent as { fields: Array<Record<string, unknown>> };

      // STRING's defaults, minus the two the MCP function set does not expose (STRING_AGG,
      // ANY_VALUE) — i.e. byte-identical to what a plain STRING column beside it advertises.
      expect(sc.fields[1]).toMatchObject({
        name: 'session_key',
        allowedAggregations: ['COUNT', 'COUNT_DISTINCT'],
        calculated: { level: 'column' },
      });
      expect(sc.fields[1].allowedAggregations).toEqual(sc.fields[0].allowedAggregations);
    });

    // The falsifying contrast, and the regression a level-blind lift would be: the empty set is
    // the AGGREGATE level's, and it is not derived from the marker alone. An absent level is that
    // level too — nothing backfills it, and aggregating is what every such field always did.
    it('keeps the empty set for an aggregate-level field, and for one carrying no level', async () => {
      const facade = {
        getDataMartDetails: jest.fn().mockResolvedValue({
          id: 'dm_1',
          name: 'Ads',
          description: '',
          fields: [
            { name: 'ctr', type: 'FLOAT', calculated: { level: 'metric' } },
            { name: 'legacy_ratio', type: 'FLOAT', calculated: {} },
          ],
          joinedFields: [],
        }),
      } as unknown as jest.Mocked<McpDataMartsFacade>;
      const tool = new GetDataMartDetailsTool(facade, publicOrigin);

      const result = await tool.handler({ data_mart_id: 'dm_1' }, context);
      const sc = result.structuredContent as { fields: Array<Record<string, unknown>> };

      expect(sc.fields[0]).toMatchObject({ name: 'ctr', allowedAggregations: [] });
      expect(sc.fields[1]).toMatchObject({ name: 'legacy_ratio', allowedAggregations: [] });
    });

    // A row-level field's own override still narrows the published set — it goes through the same
    // governance call an ordinary column does, so it cannot advertise what the validator refuses.
    it('narrows a row-level field to its own allowedAggregations override', async () => {
      const facade = {
        getDataMartDetails: jest.fn().mockResolvedValue({
          id: 'dm_1',
          name: 'Sessions',
          description: '',
          fields: [
            {
              name: 'session_key',
              type: 'STRING',
              allowedAggregations: ['COUNT_DISTINCT'],
              calculated: { level: 'column' },
            },
          ],
          joinedFields: [],
        }),
      } as unknown as jest.Mocked<McpDataMartsFacade>;
      const tool = new GetDataMartDetailsTool(facade, publicOrigin);

      const result = await tool.handler({ data_mart_id: 'dm_1' }, context);
      const sc = result.structuredContent as { fields: Array<Record<string, unknown>> };

      expect(sc.fields[0]).toMatchObject({ allowedAggregations: ['COUNT_DISTINCT'] });
    });
  });

  it('rejects explicit project_id and legacy camelCase dataMartId input', () => {
    const tool = new GetDataMartDetailsTool({} as McpDataMartsFacade, publicOrigin);

    expect(() => tool.parseInput({ data_mart_id: 'dm_1', project_id: 'project-2' })).toThrow();
    expect(() => tool.parseInput({ dataMartId: 'dm_1' })).toThrow();
  });

  it('describes details lookup as read-only metadata access', () => {
    const tool = new GetDataMartDetailsTool({} as McpDataMartsFacade, publicOrigin);

    expect(tool).toMatchObject({
      name: 'get_data_mart_details_by_id',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        id: expect.any(Object),
        name: expect.any(Object),
        url: expect.any(Object),
        description: expect.any(Object),
        fields: expect.any(Object),
        joined_fields_included: expect.any(Object),
        joined_fields: expect.any(Object),
        joins: expect.any(Object),
        operators_by_category: expect.any(Object),
      }),
      annotations: {
        title: 'Get Data Mart Details',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tool.description).toContain('Get available details');
    expect(tool.description).toContain('joined_fields');
    expect(tool.description).toContain('detail_level=native');
    expect(tool.description).toContain('get_relevant_data_marts_by_prompt');
    expect(tool.description).toContain('field-level metadata');
    expect(tool.description).toContain('allowedAggregations');
    expect(tool.description).toContain('operators_by_category');
    // Pinned so a future edit to this clause is a visible change here, not a silent one in a
    // model's context: without it, an agent reading an empty allowedAggregations has no signal
    // that the field's "usage" note may be warning it, not just approving it.
    expect(tool.description).toContain(
      'read the "usage" note carried on that field — it may also warn that a join distorts the number'
    );
    expect(tool.description).toContain('mode is REPEATED');
    expect(tool.description).toContain('type or sliceType');
    expect(tool.description).toContain('Array fields');
    expect(tool.description).toContain('does not return data owners');
    expect(tool.description).toContain('data freshness');
    expect(tool.description).toContain('sample values');
    expect(tool.description).toContain('actual data rows');
  });

  // The description is the only part of this tool a model is guaranteed to read before it has
  // ever called it, and the empty allowedAggregations it is told to trust is exactly what makes a
  // ready metric look unusable. Saying what the empty set MEANS belongs here, beside the sentence
  // that sends the agent to allowedAggregations in the first place.
  it('says in the description that an empty allowedAggregations on a metric means already computed', () => {
    const facade = {} as unknown as jest.Mocked<McpDataMartsFacade>;
    const tool = new GetDataMartDetailsTool(facade, publicOrigin);

    expect(tool.description).toContain(
      'An empty allowedAggregations on a field whose "calculated" level is "metric" means the ' +
        'value is ALREADY computed, not that the field is unusable'
    );
    expect(tool.description).toContain('instead of recomputing it from other fields');
  });
});
