import {
  buildJoinGrainSources,
  checkJoinGrain,
  JoinGrainSource,
  withoutUntouchedJoinAdvisories,
} from './join-grain';
import { AggregateCall } from './formula-analyzer';
import { FormulaViolation } from './formula-violations';

const call = (name: string, owner: string, field = 'x', distinct = false): AggregateCall => ({
  name,
  owner,
  distinct,
  nameStart: 0,
  references: [{ path: owner, field, start: 0, end: 0 }] as AggregateCall['references'],
});

const sources = (
  entries: Record<string, Partial<JoinGrainSource>>
): ReadonlyMap<string, JoinGrainSource> =>
  new Map(
    Object.entries(entries).map(([path, s]) => [
      path,
      {
        multiplication: 'none',
        keyFields: [],
        collapse: 'none',
        title: path,
        titleHidden: false,
        uniqueCountAvailable: false,
        reader: 'editor',
        ...s,
      },
    ])
  );

const run = (calls: AggregateCall[], map: ReadonlyMap<string, JoinGrainSource>) =>
  checkJoinGrain({ fieldName: 'roas', aggregateCalls: calls, sources: map });

const codes = (r: { warnings: FormulaViolation[] }) => r.warnings.map(w => w.code);

// A source the agent may not report on, as `buildJoinGrainSources` hands it over.
const withheld = (extra: Partial<JoinGrainSource> = {}): Partial<JoinGrainSource> => ({
  title: 'a joined Data Mart',
  titleHidden: true,
  fieldNames: new Map(),
  ...extra,
});

describe('checkJoinGrain', () => {
  const multiplyingCosts = sources({
    costs: { multiplication: 'multiplies', keyFields: ['traffic_source'], title: 'Costs' },
  });

  // `SUM`/`AVG` over a joined Data Mart are planned as their own `SELECT DISTINCT` sleeve with the
  // aggregate outside it (`metric-sleeve.planner.ts`, `planFormulaSleeves`), so a row that fans out
  // to several report rows still contributes once — proven live in `bigquery.integration.ts`. A
  // counting warning about them would describe a defect the engine does not have.
  it.each(['SUM', 'AVG'])('says nothing about how a joined %s counts', fn => {
    const r = run([call('SUM', ''), call(fn, 'costs', 'adCost')], multiplyingCosts);
    expect(codes(r)).toEqual(['FORMULA_JOINED_ROWS_EXCLUDED']);
  });

  // The ONE joined call shape the planner leaves in the outer SELECT (`isJoinedCallLeftInPlace`),
  // where it counts the MAIN rows that found a match rather than the joined Data Mart's own.
  it('warns about a non-DISTINCT joined COUNT, which is left counting main rows', () => {
    const r = run([call('SUM', ''), call('COUNT', 'costs', 'adCost')], multiplyingCosts);
    expect(codes(r)).toEqual(['FORMULA_JOINED_MEASURE_MULTIPLIED', 'FORMULA_JOINED_ROWS_EXCLUDED']);
  });

  // #6926 contributes advice only. A refused formula is never saved, so it never reaches the
  // report, the editor's siblings or MCP: the analyst is blocked and the agent learns nothing.
  it('never produces an error', () => {
    const r = run([call('SUM', ''), call('COUNT', 'costs', 'adCost')], multiplyingCosts);
    expect(r).not.toHaveProperty('errors');
    expect(r.warnings).toHaveLength(2);
  });

  it('names the joined Data Mart and the key it is joined on', () => {
    const r = run([call('COUNT', 'costs', 'adCost')], multiplyingCosts);
    expect(r.warnings[0].code).toBe('FORMULA_JOINED_MEASURE_MULTIPLIED');
    expect(r.warnings[0].message).toContain('`costs.adCost` comes from `Costs`');
    expect(r.warnings[0].message).toContain('joined on `traffic_source`, which can match several');
  });

  // It must point at a column of the JOINED Data Mart — `keyFields` are the parent's columns, and
  // counting distinct values of one of those counts every main row, including unmatched ones.
  it('points at a column of the joined Data Mart, not at the join key just named', () => {
    const r = run([call('COUNT', 'costs', 'adCost')], multiplyingCosts);
    expect(r.warnings[0].message).toContain(
      'Use COUNT(DISTINCT ...) on a column that identifies them'
    );
    expect(r.warnings[0].message).not.toContain('over the join key');
  });

  // A formula cannot reference a joined Unique Count (`joinedUniqueCountReference` refuses it), so
  // an offer phrased as something to write into the formula would lead straight into an error.
  it('offers the Unique Count measure only when the source offers it, and only in a report', () => {
    const offered = run(
      [call('COUNT', 'costs', 'adCost')],
      sources({
        costs: {
          multiplication: 'multiplies',
          keyFields: ['traffic_source'],
          title: 'Costs',
          uniqueCountAvailable: true,
        },
      })
    );
    expect(offered.warnings[0].message).toMatch(
      /identifies them, or pick its Unique Count measure in a report\.$/
    );

    const notOffered = run([call('COUNT', 'costs', 'adCost')], multiplyingCosts);
    expect(notOffered.warnings[0].message).not.toContain('Unique Count');
    expect(notOffered.warnings[0].message).toMatch(/identifies them\.$/);
  });

  it('offers the agent the Unique Count field rather than a report measure', () => {
    const r = run(
      [call('COUNT', 'costs', 'adCost')],
      sources({
        costs: {
          multiplication: 'multiplies',
          keyFields: ['traffic_source'],
          title: 'Costs',
          uniqueCountAvailable: true,
          reader: 'agent',
          fieldNames: new Map([['adCost', 'costs__adCost']]),
        },
      })
    );
    expect(r.warnings[0].message).toMatch(
      /identifies them, or select that Data Mart's Unique Count field instead\.$/
    );
  });

  // The parent side undecidable, the target side proven to collapse: both directions are open,
  // and a sentence naming only "inflated" flips to "fewer" once the analyst sets the key it asks for.
  it('adds the collapse to the unproven-grain message when the joined rows share keys', () => {
    const r = run(
      [call('COUNT', 'orders', 'amount')],
      sources({
        orders: {
          multiplication: 'unknown',
          collapse: 'collapses',
          title: 'Orders',
          unprovenAt: '',
        },
      })
    );
    expect(codes(r)).toEqual([
      'FORMULA_JOINED_MEASURE_GRAIN_UNPROVEN',
      'FORMULA_JOINED_ROWS_EXCLUDED',
    ]);
    expect(r.warnings[0].message).toContain('if several, COUNT is inflated');
    expect(r.warnings[0].message).toContain('so COUNT can come out lower too');
  });

  // Undecidable is its OWN message: an unknown verdict carries no key to name, and telling an
  // analyst their number IS inflated when that was never established is a confident wrong answer.
  it('warns with the unproven-grain message when uniqueness is undecidable', () => {
    const r = run(
      [call('SUM', ''), call('COUNT', 'costs', 'adCost')],
      sources({ costs: { multiplication: 'unknown', title: 'Costs', unprovenAt: '' } })
    );
    expect(codes(r)).toEqual([
      'FORMULA_JOINED_MEASURE_GRAIN_UNPROVEN',
      'FORMULA_JOINED_ROWS_EXCLUDED',
    ]);
  });

  it('names the Data Mart that is missing the primary key', () => {
    const own = run(
      [call('COUNT', 'costs', 'adCost')],
      sources({ costs: { multiplication: 'unknown', title: 'Costs', unprovenAt: '' } })
    );
    expect(own.warnings[0].message).toContain('and this Data Mart has no Primary Key');
    expect(own.warnings[0].message).toContain('Set a Primary Key to find out.');

    const upstream = run(
      [call('COUNT', 'costs.clicks', 'adCost')],
      sources({
        costs: { title: 'Costs' },
        'costs.clicks': { multiplication: 'unknown', title: 'Clicks', unprovenAt: 'costs' },
      })
    );
    expect(upstream.warnings[0].message).toContain('and `Costs` has no Primary Key');
  });

  // A payload that predates `unprovenAt` must not default to blaming the main Data Mart: that
  // would tell the analyst to set a key they may already have.
  it('claims no missing Primary Key when the verdict does not say whose it is', () => {
    const r = run(
      [call('COUNT', 'costs', 'adCost')],
      sources({ costs: { multiplication: 'unknown', title: 'Costs' } })
    );
    expect(r.warnings[0].code).toBe('FORMULA_JOINED_MEASURE_GRAIN_UNPROVEN');
    expect(r.warnings[0].message).not.toContain('Primary Key');
    expect(r.warnings[0].message).toContain("it can't be checked whether the join matches");
  });

  // A path the blendable schema no longer carries — a deleted relationship, an unpublished target.
  // NOTHING is known about its grain; on the save path a real error about the broken reference
  // rides along anyway.
  it('says nothing about the grain of a source it cannot resolve', () => {
    const r = run([call('SUM', ''), call('COUNT', 'costs', 'adCost')], sources({}));
    expect(codes(r)).toEqual(['FORMULA_JOINED_ROWS_EXCLUDED']);
  });

  // The aliasPath is not a name this may fall back to: on the MCP side it is exactly the token an
  // inaccessible source's title is withheld for.
  it('calls an unresolvable source a joined Data Mart rather than naming its alias', () => {
    const r = run([call('SUM', 'costs', 'adCost')], sources({}));
    expect(r.warnings[0].message).toContain('reads a joined Data Mart through a join');
    expect(r.warnings[0].message).not.toContain('costs');
  });

  // An inherited verdict carries the ANCESTOR's key, so a sentence naming the leaf as the mart
  // joined on it points the analyst at a relationship that is not at fault.
  it('names the hop that multiplies, not the leaf that inherited its key', () => {
    const r = run(
      [call('COUNT', 'costs.campaigns', 'budget')],
      sources({
        costs: { multiplication: 'multiplies', keyFields: ['traffic_source'], title: 'Costs' },
        'costs.campaigns': {
          multiplication: 'multiplies',
          keyFields: ['traffic_source'],
          title: 'Campaigns',
          multipliedAt: 'costs',
        },
      })
    );
    expect(r.warnings[0].message).toContain(
      '`Campaigns`, reached through `Costs` joined on `traffic_source`, which can match'
    );
  });

  it('keeps the direct wording when the source is the hop that multiplies', () => {
    const r = run(
      [call('COUNT', 'costs', 'adCost')],
      sources({
        costs: {
          multiplication: 'multiplies',
          keyFields: ['traffic_source'],
          title: 'Costs',
          multipliedAt: 'costs',
        },
      })
    );
    expect(r.warnings[0].message).toContain('`Costs`, joined on `traffic_source`');
    expect(r.warnings[0].message).not.toContain('reached through');
  });

  // "this Data Mart" is TRUE only while the failing hop hangs straight off the main Data Mart; one
  // hop deeper the key is on another joined Data Mart. An inherited verdict follows its own hop.
  it.each([
    ['a failing hop off the main Data Mart', 'costs', 'costs', 'this Data Mart'],
    ['a failing hop below another joined one', 'orders.items', 'orders.items', 'its parent'],
    [
      'an inherited verdict from a hop off the main one',
      'costs.campaigns',
      'costs',
      'this Data Mart',
    ],
  ])('says whose rows the key matches for %s', (_case, owner, multipliedAt, rowsOf) => {
    const r = run(
      [call('COUNT', owner, 'qty')],
      sources({
        [owner]: {
          multiplication: 'multiplies',
          keyFields: ['order_id'],
          title: 'Leaf',
          multipliedAt,
        },
      })
    );
    expect(r.warnings[0].message).toContain(`can match several rows of ${rowsOf}`);
  });

  // The multiplication sentence is built around naming the key. A verdict that proves
  // multiplication but carries none says so without a key — never that a Primary Key is missing.
  it('says the join multiplies without naming a key when the verdict carries none', () => {
    const r = run(
      [call('COUNT', 'costs', 'adCost')],
      sources({ costs: { multiplication: 'multiplies', keyFields: [], title: 'Costs' } })
    );
    expect(r.warnings[0].code).toBe('FORMULA_JOINED_MEASURE_MULTIPLIED');
    expect(r.warnings[0].message).toContain(
      '`costs.adCost` comes from `Costs`, whose join can match several rows of this Data Mart'
    );
    expect(r.warnings[0].message).not.toContain('Primary Key');
  });

  it.each([
    ['MIN', false],
    ['MAX', false],
    ['ANY_VALUE', false],
    ['APPROX_COUNT_DISTINCT', false],
    ['SUM', true],
    ['AVG', true],
    ['COUNT', true],
  ])('says nothing about counting for %s (distinct: %s)', (name, distinct) => {
    const r = run([call(name, 'costs', 'adCost', distinct)], multiplyingCosts);
    expect(codes(r)).toEqual(['FORMULA_JOINED_ROWS_EXCLUDED']);
  });

  it('never blames the main Data Mart for its own join', () => {
    const r = run([call('COUNT', '')], multiplyingCosts);
    expect(r.warnings).toEqual([]);
  });

  it('reports one counting violation per owner, not per call', () => {
    const r = run(
      [call('COUNT', 'costs', 'adCost'), call('COUNT', 'costs', 'impressions')],
      multiplyingCosts
    );
    expect(codes(r)).toEqual(['FORMULA_JOINED_MEASURE_MULTIPLIED', 'FORMULA_JOINED_ROWS_EXCLUDED']);
  });

  describe('when several joined rows share a key', () => {
    // main `customers` (PK customer_id) → `orders` on customer_id: the parent side is clean, but
    // the joined Data Mart is collapsed to one row per customer before it is attached, so
    // `COUNT(orders.order_id)` counts customers with an order, not orders.
    const collapsingOrders = sources({ orders: { collapse: 'collapses', title: 'Orders' } });

    it('warns that the COUNT can come out lower, on a join clean on the parent side', () => {
      const r = run([call('COUNT', 'orders', 'order_id')], collapsingOrders);
      expect(codes(r)).toEqual([
        'FORMULA_JOINED_MEASURE_COLLAPSED',
        'FORMULA_JOINED_ROWS_EXCLUDED',
      ]);
      expect(r.warnings[0].subject).toBe('orders.order_id');
      expect(r.warnings[0].message).toContain(
        '`orders.order_id` comes from `Orders`, where several rows can share one join key value'
      );
      expect(r.warnings[0].message).toContain('can be fewer than that Data Mart');
      expect(r.warnings[0].message).toMatch(/identifies them\.$/);
    });

    it('stays silent about counting when the join is one-to-one on both sides', () => {
      const r = run([call('COUNT', 'orders', 'order_id')], sources({ orders: {} }));
      expect(codes(r)).toEqual(['FORMULA_JOINED_ROWS_EXCLUDED']);
    });

    it('names the hop that collapses when it is an ancestor', () => {
      const r = run(
        [call('COUNT', 'users.orgs', 'org_name')],
        sources({
          users: { collapse: 'collapses', title: 'Users' },
          'users.orgs': { collapse: 'collapses', title: 'Organizations', collapsedAt: 'users' },
        })
      );
      expect(r.warnings[0].message).toContain(
        '`Organizations`, reached through `Users`, where several rows can share'
      );
    });

    it('offers the Unique Count measure when the source offers it', () => {
      const r = run(
        [call('COUNT', 'orders', 'order_id')],
        sources({ orders: { collapse: 'collapses', title: 'Orders', uniqueCountAvailable: true } })
      );
      expect(r.warnings[0].message).toMatch(/pick its Unique Count measure in a report\.$/);
    });

    // Both at once: the parent side is the one a key change fixes, so it is the one to name.
    it('speaks about the parent side when both sides are off', () => {
      const r = run(
        [call('COUNT', 'orders', 'order_id')],
        sources({
          orders: {
            multiplication: 'multiplies',
            keyFields: ['customer_id'],
            collapse: 'collapses',
            title: 'Orders',
          },
        })
      );
      expect(codes(r)).toEqual([
        'FORMULA_JOINED_MEASURE_MULTIPLIED',
        'FORMULA_JOINED_ROWS_EXCLUDED',
      ]);
    });
  });

  describe('rows the join drops', () => {
    // Every sleeve and every dedup CTE is LEFT JOINed from the main Data Mart, so a joined row
    // matching nothing never reaches the number — for a lone joined SUM exactly as for a ratio.
    it('warns for a formula reading a single joined Data Mart', () => {
      const r = run([call('SUM', 'costs', 'adCost')], sources({ costs: { title: 'Costs' } }));
      expect(codes(r)).toEqual(['FORMULA_JOINED_ROWS_EXCLUDED']);
      expect(r.warnings[0].message).toBe(
        'This formula reads Costs through a join. Its rows that match nothing here are dropped, ' +
          "so the result may not match that Data Mart's own totals."
      );
      expect(r.warnings[0]).not.toHaveProperty('subject');
    });

    it('says nothing for a formula reading only its own Data Mart', () => {
      const r = run([call('SUM', ''), call('COUNT', '')], sources({}));
      expect(r.warnings).toEqual([]);
    });

    // The main Data Mart keeps every row, so naming it here — "combines X and this Data Mart" —
    // read as if its totals were at risk too.
    it('names only the joined Data Marts, however many', () => {
      const r = run(
        [call('SUM', ''), call('SUM', 'costs', 'adCost'), call('SUM', 'orders', 'amount')],
        sources({ costs: { title: 'Costs' }, orders: { title: 'Orders' } })
      );
      expect(r.warnings[0].message).toBe(
        'This formula reads Costs and Orders through joins. Their rows that match nothing here ' +
          "are dropped, so the result may not match those Data Marts' own totals."
      );
    });

    it('names a Data Mart reached along two paths once', () => {
      const r = run(
        [call('SUM', 'orders', 'amount'), call('SUM', 'refunds', 'amount')],
        sources({ orders: { title: 'Orders' }, refunds: { title: 'Orders' } })
      );
      expect(r.warnings[0].message).toContain('reads Orders through a join. Its rows');
    });

    it.each([
      [['a', 'b'], 'reads 2 joined Data Marts through joins'],
      [['named', 'a'], 'reads Named and another joined Data Mart through joins'],
      [['named', 'a', 'b'], 'reads Named and 2 other joined Data Marts through joins'],
    ])('tells unnamed Data Marts apart: %j', (owners, expected) => {
      const r = run(
        owners.map(owner => call('SUM', owner, 'x')),
        sources({ named: { title: 'Named' }, a: withheld(), b: withheld() })
      );
      expect(r.warnings[0].message).toContain(expected);
    });

    it('keeps backticks out of a title, so the web marks no token for it', () => {
      const r = run([call('SUM', 'costs', 'adCost')], sources({ costs: { title: 'Co`sts' } }));
      expect(r.warnings[0].message).not.toContain('`');
    });
  });

  describe('for an agent that may not see everything', () => {
    // Withholding the TITLE and then spelling the reference as `<alias>.<column>`, or even the bare
    // column, discloses the same source by another route: on MCP `prepareSchema` has already
    // stripped the formula that would otherwise carry either.
    it('names nothing of a source it may not report on, and keeps the verdict', () => {
      const r = run(
        [call('COUNT', 'dm_finance_eu', 'net_spend')],
        sources({
          dm_finance_eu: withheld({ multiplication: 'multiplies', keyFields: ['traffic_source'] }),
        })
      );
      const message = r.warnings[0].message;
      expect(message).not.toContain('dm_finance_eu');
      expect(message).not.toContain('net_spend');
      expect(r.warnings[0]).not.toHaveProperty('subject');
      expect(message).toContain('A COUNT here reads a joined Data Mart, joined on');
      // The key is a column of the MAIN Data Mart at depth 1, which the caller is reading anyway.
      expect(message).toContain('`traffic_source`');
    });

    // At depth 2 the failing hop's parent is itself a joined Data Mart: its columns are withheld
    // along with its title.
    it('withholds the key of a hop whose parent it may not see', () => {
      const r = run(
        [call('COUNT', 'costs.campaigns', 'budget')],
        sources({
          costs: withheld(),
          'costs.campaigns': withheld({
            multiplication: 'multiplies',
            keyFields: ['campaign_id'],
            multipliedAt: 'costs.campaigns',
          }),
        })
      );
      expect(r.warnings[0].message).not.toContain('campaign_id');
      expect(r.warnings[0].message).toContain('whose join can match several rows of its parent');
    });

    it('tells two unnamed Data Marts apart in one sentence', () => {
      const r = run(
        [call('COUNT', 'costs.campaigns', 'budget')],
        sources({
          costs: withheld({ multiplication: 'multiplies', keyFields: ['traffic_source'] }),
          'costs.campaigns': withheld({
            multiplication: 'multiplies',
            keyFields: ['traffic_source'],
            multipliedAt: 'costs',
          }),
        })
      );
      expect(r.warnings[0].message).toContain(
        'A COUNT here reads a joined Data Mart, reached through another joined Data Mart joined on'
      );
    });

    it('does not say which withheld Data Mart lacks a primary key', () => {
      const r = run(
        [call('COUNT', 'costs.clicks', 'adCost')],
        sources({
          costs: withheld(),
          'costs.clicks': withheld({ multiplication: 'unknown', unprovenAt: 'costs' }),
        })
      );
      expect(r.warnings[0].message).not.toContain('Primary Key');
    });

    it('spells a field by the name the agent can query, and withholds a hidden one', () => {
      const costs = {
        multiplication: 'multiplies' as const,
        keyFields: ['traffic_source'],
        title: 'Costs',
        fieldNames: new Map([['adCost', 'costs__adCost']]),
      };
      const published = run([call('COUNT', 'costs', 'adCost')], sources({ costs }));
      expect(published.warnings[0].subject).toBe('costs__adCost');
      expect(published.warnings[0].message).toContain('`costs__adCost` comes from `Costs`');

      const hidden = run([call('COUNT', 'costs', 'secret')], sources({ costs }));
      expect(hidden.warnings[0].message).toContain('A COUNT here reads `Costs`');
      expect(hidden.warnings[0].message).not.toContain('secret');
    });
  });
});

describe('buildJoinGrainSources', () => {
  const source = (extra: Record<string, unknown> = {}) =>
    ({
      aliasPath: 'costs',
      isIncluded: true,
      isAccessibleForReporting: true,
      ...extra,
    }) as never;

  it('falls back to the aliasPath when a source arrives without a title', () => {
    const map = buildJoinGrainSources([source()], { kind: 'editor' });
    expect(map.get('costs')?.title).toBe('costs');
    expect(map.get('costs')?.titleHidden).toBe(false);
  });

  // Anything but the exact `available` verdict means the measure is NOT on the menu — including the
  // diagnostic values that each explain a declared key the metric still cannot use — and neither
  // is it on a source the report leaves out or the reader may not report on.
  it.each([
    ['available', {}, true],
    ['no-primary-key', {}, false],
    ['disconnected-primary-key', {}, false],
    ['nested-primary-key', {}, false],
    ['nested-and-disconnected-primary-key', {}, false],
    [undefined, {}, false],
    ['available', { isIncluded: false }, false],
    ['available', { isAccessibleForReporting: false }, false],
  ])(
    'reads uniqueCountAvailability %s on %j as offering the measure: %s',
    (availability, extra, expected) => {
      const map = buildJoinGrainSources(
        [source({ title: 'Costs', uniqueCountAvailability: availability, ...extra })],
        { kind: 'editor' }
      );
      expect(map.get('costs')?.uniqueCountAvailable).toBe(expected);
    }
  );

  // A client that does not know the property must fall back to the reading that still warns.
  it('reads absent verdicts as the ones that still warn', () => {
    const map = buildJoinGrainSources([source({ title: 'Costs' })], { kind: 'editor' });
    expect(map.get('costs')?.multiplication).toBe('unknown');
    expect(map.get('costs')?.collapse).toBe('collapses');
  });

  // The whole point of substituting rather than dropping: the verdict survives, only what names the
  // source goes.
  it('keeps a source the agent may not see, with its verdict and nothing that names it', () => {
    const map = buildJoinGrainSources(
      [
        source({
          title: 'Costs',
          isAccessibleForReporting: false,
          uniqueCountAvailability: 'available',
          mainGrainMultiplication: 'multiplies',
          mainGrainKeyFields: ['traffic_source'],
          mainGrainMultipliedAt: 'costs',
          mainGrainCollapse: 'none',
        }),
      ],
      { kind: 'agent', blendedFields: [blended('costs', 'adCost')] }
    );
    expect(map.get('costs')).toEqual({
      multiplication: 'multiplies',
      keyFields: ['traffic_source'],
      collapse: 'none',
      title: 'a joined Data Mart',
      titleHidden: true,
      uniqueCountAvailable: false,
      reader: 'agent',
      fieldNames: new Map(),
      unprovenAt: undefined,
      multipliedAt: 'costs',
      collapsedAt: undefined,
    });
  });

  it('gives the agent the published name of each visible field of a source it may see', () => {
    const map = buildJoinGrainSources([source({ title: 'Costs' })], {
      kind: 'agent',
      blendedFields: [
        blended('costs', 'adCost'),
        blended('costs', 'secret', { isHidden: true }),
        blended('orders', 'amount'),
      ],
    });
    expect(map.get('costs')?.fieldNames).toEqual(new Map([['adCost', 'costs__adCost']]));
  });

  // The analyst editing the formula needs the label they actually wrote, and sees the join tree.
  it('hides nothing from the editor', () => {
    const map = buildJoinGrainSources(
      [source({ title: 'Costs', isAccessibleForReporting: false })],
      { kind: 'editor' }
    );
    expect(map.get('costs')?.title).toBe('Costs');
    expect(map.get('costs')?.titleHidden).toBe(false);
    expect(map.get('costs')?.fieldNames).toBeUndefined();
  });
});

describe('withoutUntouchedJoinAdvisories', () => {
  const warning = (code: string, field: string): FormulaViolation => ({
    code,
    field,
    message: code,
  });
  const all = [
    warning('FORMULA_JOINED_ROWS_EXCLUDED', 'roas'),
    warning('FORMULA_JOINED_MEASURE_MULTIPLIED', 'roas'),
    warning('FORMULA_JOINED_MEASURE_GRAIN_UNPROVEN', 'orders_counted'),
    warning('FORMULA_JOINED_MEASURE_COLLAPSED', 'orders_counted'),
    warning('FORMULA_UNGUARDED_DIVISION', 'roas'),
  ];
  const kept = (touched: string[], primaryKeyChanged: boolean) =>
    withoutUntouchedJoinAdvisories(all, new Set(touched), primaryKeyChanged).map(
      w => `${w.field}:${w.code}`
    );

  it('keeps every advisory about a field the save edited', () => {
    expect(kept(['roas', 'orders_counted'], false)).toHaveLength(all.length);
  });

  // Nothing a schema save does changes which rows a join drops, so repeating it after every
  // unrelated edit is noise.
  it('drops the join advisories about an untouched field', () => {
    expect(kept([], false)).toEqual(['roas:FORMULA_UNGUARDED_DIVISION']);
  });

  // The primary key is what the counting advisories are judged against — and what they ask for.
  it('keeps the counting advisories for every field when the primary key changed', () => {
    expect(kept([], true)).toEqual([
      'roas:FORMULA_JOINED_MEASURE_MULTIPLIED',
      'orders_counted:FORMULA_JOINED_MEASURE_GRAIN_UNPROVEN',
      'orders_counted:FORMULA_JOINED_MEASURE_COLLAPSED',
      'roas:FORMULA_UNGUARDED_DIVISION',
    ]);
  });
});

function blended(aliasPath: string, field: string, extra: { isHidden?: boolean } = {}) {
  return {
    aliasPath,
    originalFieldName: field,
    name: `${aliasPath.split('.').join('__')}__${field}`,
    isHidden: extra.isHidden ?? false,
  } as never;
}
