import { FormulaViolation, FormulaViolations } from './formula-violations';

// Every constructor in the catalogue, called with recognizable arguments. Built as a table rather
// than one test per constructor so the invariants below hold for the WHOLE vocabulary — including
// a violation added tomorrow, which fails here until it is listed.
const REF = 'orders.amount';
const FN = 'SUM';
const COLUMN = 'clicks';

const built: Record<string, FormulaViolation> = {
  levelMixing: FormulaViolations.levelMixing('ctr', COLUMN),
  joinedReferenceOutsideAggregate: FormulaViolations.joinedReferenceOutsideAggregate('ctr', REF),
  aggregateMixesOwners: FormulaViolations.aggregateMixesOwners('ctr', FN, [REF, 'clicks']),
  nestedAggregate: FormulaViolations.nestedAggregate('ctr', FN),
  aggregateOnAggregate: FormulaViolations.aggregateOnAggregate('ctr', REF),
  calculatedFieldOnAggregate: FormulaViolations.calculatedFieldOnAggregate('ctr', REF),
  unbalancedParenthesis: FormulaViolations.unbalancedParenthesis('ctr', FN),
  aggregateWithoutField: FormulaViolations.aggregateWithoutField('ctr', FN),
  subquery: FormulaViolations.subquery('ctr'),
  window: FormulaViolations.window('ctr'),
  statementSeparator: FormulaViolations.statementSeparator('ctr'),
  expressionSeparator: FormulaViolations.expressionSeparator('ctr'),
  dialectAmbiguousMarker: FormulaViolations.dialectAmbiguousMarker('ctr', '#'),
  dialectAmbiguousEscape: FormulaViolations.dialectAmbiguousEscape('ctr'),
  unterminatedQuotedText: FormulaViolations.unterminatedQuotedText('ctr'),
  unknownReference: FormulaViolations.unknownReference('ctr', REF, 'missing'),
  calculatedReference: FormulaViolations.calculatedReference('ctr', REF),
  selfReference: FormulaViolations.selfReference('ctr'),
  circularReference: FormulaViolations.circularReference('ctr', ['ctr', 'roas', 'ctr']),
  joinedPathNotFound: FormulaViolations.joinedPathNotFound('ctr', REF, 'orders'),
  joinedFieldHidden: FormulaViolations.joinedFieldHidden('ctr', REF),
  joinedFieldUnknown: FormulaViolations.joinedFieldUnknown('ctr', REF, 'orders'),
  joinedFieldAmbiguous: FormulaViolations.joinedFieldAmbiguous('ctr', REF, 'orders__amount'),
  joinedSourceNotAccessible: FormulaViolations.joinedSourceNotAccessible('ctr', REF, 'orders'),
  joinedReferenceUnverified: FormulaViolations.joinedReferenceUnverified('ctr', REF),
  joinedUniqueCountReference: FormulaViolations.joinedUniqueCountReference('ctr', REF),
  mainUniqueCountReference: FormulaViolations.mainUniqueCountReference('ctr', 'unique_count'),
  tagInStringLiteral: FormulaViolations.tagInStringLiteral('ctr'),
  syntax: FormulaViolations.syntax('ctr', 'something could not be parsed'),
  unguardedDivision: FormulaViolations.unguardedDivision('ctr', 'SUM(impressions)'),
  joinedMeasureMultiplied: FormulaViolations.joinedMeasureMultiplied(
    'ctr',
    'orders.amount',
    'orders',
    ['id']
  ),
  joinedMeasureGrainUnproven: FormulaViolations.joinedMeasureGrainUnproven(
    'ctr',
    'orders.amount',
    'orders',
    'this Data Mart'
  ),
  joinedMeasureCollapsed: FormulaViolations.joinedMeasureCollapsed(
    'ctr',
    'orders.amount',
    'orders'
  ),
  joinedRowsExcluded: FormulaViolations.joinedRowsExcluded('ctr', ['orders', 'items']),
  warehouseRejected: FormulaViolations.warehouseRejected('ctr', 'Unrecognized name: clcks'),
  warehouseRejectedAsSet: FormulaViolations.warehouseRejectedAsSet('ctr', 'alias collision'),
  otherFieldErrorsTruncated: FormulaViolations.otherFieldErrorsTruncated('ctr', 12),
  warehouseCheckSkipped: FormulaViolations.warehouseCheckSkipped(['ctr', 'roas']),
};

const entries = Object.entries(built);

describe('FormulaViolations', () => {
  // A change detector, deliberately: a violation added without a row in the table above would make
  // every invariant below pass by simply not covering it. Four constructor pairs share a code
  // (joinedFieldHidden/joinedFieldUnknown, warehouseRejected/warehouseRejectedAsSet,
  // aggregateOnAggregate/calculatedFieldOnAggregate, selfReference/circularReference), which is why
  // distinct codes run four behind the constructor count.
  it('exercises every constructor in the catalogue', () => {
    const distinctCodes = new Set(entries.map(([, violation]) => violation.code));
    expect(distinctCodes.size).toBe(Object.keys(FormulaViolations).length - 4);
  });

  it.each(entries)('%s names the calculated field it belongs to', (_name, violation) => {
    expect(violation.field).toBe('ctr');
    expect(violation.code).toMatch(/^FORMULA_[A-Z_]+$/);
    expect(violation.message.length).toBeGreaterThan(0);
  });

  // THE CONTRACT THE EDITOR READS. The web places its markers by matching the violation's subject
  // against the formula text. Until that field existed, it did so by parsing the LEADING BACKTICKED
  // TOKEN out of the message — so message wording and marker placement were one thing, and a
  // reworded sentence moved markers with nothing failing. These two assertions are where wording
  // drift now fails:
  //   1. a violation carrying `subject` opens its message with exactly that token, backticked;
  //   2. a message that opens with a backticked token carries it as `subject`.
  // Together they mean the structured field and the prose can never disagree, and a new violation
  // that forgets `subject` is caught here rather than by a marker quietly never appearing.
  const leadingBacktickedToken = (message: string): string | undefined =>
    /^`([^`]+)`/.exec(message)?.[1];

  it.each(entries)('%s keeps subject and message in agreement', (_name, violation) => {
    const leading = leadingBacktickedToken(violation.message);
    if (violation.subject !== undefined) {
      expect(leading).toBe(violation.subject);
    } else {
      expect(leading).toBeUndefined();
    }
  });

  it('publishes a subject for every violation that blames one token', () => {
    const withSubject = entries
      .filter(([, violation]) => violation.subject !== undefined)
      .map(([name]) => name)
      .sort();

    // Named explicitly, not derived: this list changing is a change to what the editor can point
    // at, which is a decision, not an accident.
    expect(withSubject).toEqual(
      [
        'aggregateMixesOwners',
        'aggregateOnAggregate',
        'aggregateWithoutField',
        'calculatedFieldOnAggregate',
        'calculatedReference',
        'circularReference',
        'dialectAmbiguousMarker',
        'joinedFieldAmbiguous',
        'joinedFieldHidden',
        'joinedFieldUnknown',
        'joinedMeasureCollapsed',
        'joinedMeasureGrainUnproven',
        'joinedMeasureMultiplied',
        'joinedPathNotFound',
        'joinedReferenceOutsideAggregate',
        'joinedReferenceUnverified',
        'joinedSourceNotAccessible',
        'joinedUniqueCountReference',
        'levelMixing',
        'mainUniqueCountReference',
        'nestedAggregate',
        'selfReference',
        'unbalancedParenthesis',
        'unguardedDivision',
        'unknownReference',
      ].sort()
    );
  });

  // The two level rules end in the same instruction — "wrap it" — so they must offer the same
  // examples; an analyst who hits both should not have to wonder why only one of them mentions AVG.
  // The set is deliberately AVG-free: COUNT, MIN and MAX apply to any type, while AVG is invalid
  // for the string-valued fields both rules routinely fire on (`orders.status`, `campaign_name`).
  it('offers the same example aggregations in both level rules', () => {
    const examples = /\(([A-Z/ ]+)\)/.exec(built.levelMixing.message)?.[1];
    expect(examples).toBe('SUM / COUNT / MIN / MAX');
    expect(built.joinedReferenceOutsideAggregate.message).toContain(`(${examples})`);
  });

  // Same verdict, same code — but an analyst told "already an aggregate" about a Unique Count
  // measure has nothing to go and change, while one told it about a calculated field has another
  // formula to open. Losing that distinction is exactly what reusing the 'aggregate' state would do.
  it('says a wrapped calculated field is a calculated field, not just an aggregate', () => {
    expect(built.calculatedFieldOnAggregate.code).toBe(built.aggregateOnAggregate.code);
    expect(built.calculatedFieldOnAggregate.message).toContain('calculated field');
    expect(built.aggregateOnAggregate.message).not.toContain('calculated field');
  });

  // Same verdict, same code, deliberately different sentences: a loop of one field is a typo and the
  // analyst needs the token to delete, while a longer loop is only findable at all if the message
  // spells the chain out — the fields on it are in OTHER formulas the analyst is not looking at.
  it('spells a self-reference differently from a longer loop', () => {
    expect(built.selfReference.code).toBe(built.circularReference.code);
    expect(built.selfReference.message).toContain('references itself');
    expect(built.circularReference.message).toContain('`ctr` → `roas` → `ctr`');
  });

  it('blames the reference, not the path, when a joined path is missing', () => {
    // `orders.amount` is what the analyst wrote and what the editor can find in the text; `orders`
    // is only part of it, and matching that alone would mark the wrong span.
    expect(built.joinedPathNotFound.subject).toBe(REF);
    expect(built.joinedFieldUnknown.subject).toBe(REF);
    expect(built.joinedSourceNotAccessible.subject).toBe(REF);
  });

  it('blames the function, not its arguments, for a call-level rule', () => {
    expect(built.nestedAggregate.subject).toBe(FN);
    expect(built.unbalancedParenthesis.subject).toBe(FN);
    expect(built.aggregateWithoutField.subject).toBe(FN);
    expect(built.aggregateMixesOwners.subject).toBe(FN);
  });

  it('names the field, the joined Data Mart and the key of a multiplied count', () => {
    const v = FormulaViolations.joinedMeasureMultiplied('roas', 'costs.adCost', 'Costs', [
      'traffic_source',
    ]);
    expect(v.code).toBe('FORMULA_JOINED_MEASURE_MULTIPLIED');
    expect(v.field).toBe('roas');
    expect(v.subject).toBe('costs.adCost');
    expect(v.message).toContain('`Costs`');
    expect(v.message).toContain('`traffic_source`');
  });

  it('spells a composite key in full', () => {
    const v = FormulaViolations.joinedMeasureMultiplied('roas', 'costs.adCost', 'Costs', [
      'traffic_source',
      'date',
    ]);
    expect(v.message).toContain('`traffic_source`');
    expect(v.message).toContain('`date`');
  });

  // A verdict inherited from an ancestor hop carries THAT hop's key, so the sentence must say
  // whose it is rather than presenting it as the measured source's own.
  it('names the ancestor hop when the key belongs to it and not to the source', () => {
    const v = FormulaViolations.joinedMeasureMultiplied(
      'roas',
      'costs.campaigns.budget',
      'Campaigns',
      ['traffic_source'],
      'Costs'
    );
    expect(v.message).toContain('reached through `Costs` joined on `traffic_source`');
    expect(v.message).not.toMatch(/`Campaigns`, joined on/);
  });

  // The message exists to move the analyst somewhere. `COUNT(DISTINCT …)` keeps its sleeve
  // (`metric-sleeve.planner.ts`) and is always available — but over a column of the JOINED Data
  // Mart, never over `key`, which names the PARENT's columns and has just been spelled out one
  // clause earlier as what the source is joined on.
  it('offers a count over the joined Data Mart, not over the parent key it just named', () => {
    const v = FormulaViolations.joinedMeasureMultiplied('spend', 'costs.adCost', 'Costs', [
      'traffic_source',
    ]);
    expect(v.message).toContain('Use COUNT(DISTINCT ...) on a column that identifies them');
    expect(v.message).toContain("not that Data Mart's rows");
    expect(v.message).not.toContain('over the join key');
  });

  // The Unique Count half is CONDITIONAL: a source publishes that measure only when it declares a
  // usable primary key of its own, which the `multiplies` verdict says nothing about.
  it('names the Unique Count measure only when the source publishes one', () => {
    const args = ['spend', 'costs.adCost', 'Costs', ['traffic_source']] as const;
    const offered = FormulaViolations.joinedMeasureMultiplied(
      ...args,
      undefined,
      'this Data Mart',
      true
    );
    const withheld = FormulaViolations.joinedMeasureMultiplied(...args);
    expect(offered.message).toContain(
      'identifies them, or pick its Unique Count measure in a report.'
    );
    expect(withheld.message).not.toContain('Unique Count');
    expect(withheld.message).toMatch(/identifies them\.$/);
  });

  // Scoped to a joined COUNT, which is the one call the planner leaves in the outer SELECT. A
  // sentence about "an additive total" would re-assert the SUM/AVG defect this feature was
  // re-scoped to stop claiming.
  it.each([
    ['joinedMeasureMultiplied', built.joinedMeasureMultiplied],
    ['joinedMeasureGrainUnproven', built.joinedMeasureGrainUnproven],
    ['joinedMeasureCollapsed', built.joinedMeasureCollapsed],
  ])('scopes %s to a COUNT rather than to any additive total', (_name, violation) => {
    expect(violation.message).toMatch(/COUNT (counts matches|is inflated|counts the rows)/);
    expect(violation.message).not.toMatch(/additive|\bSUM\b|\bAVG\b/i);
  });

  it('names the Data Mart missing the primary key rather than a key it does not have', () => {
    const v = FormulaViolations.joinedMeasureGrainUnproven(
      'roas',
      'costs.adCost',
      'Costs',
      'this Data Mart'
    );
    expect(v.code).toBe('FORMULA_JOINED_MEASURE_GRAIN_UNPROVEN');
    expect(v.subject).toBe('costs.adCost');
    expect(v.message).toContain('this Data Mart has no Primary Key');
    expect(v.message).not.toContain('joined on');
  });

  // Two Data Marts the reader may not have named to them are still two. The unproven-grain
  // sentence has the same two slots as the multiplication one, so it needs the same guard.
  it('tells two unnamed Data Marts apart in the unproven-grain sentence', () => {
    const v = FormulaViolations.joinedMeasureGrainUnproven(
      'roas',
      'costs.campaigns.budget',
      'a joined Data Mart',
      'a joined Data Mart'
    );
    expect(v.message).toContain(
      'comes from a joined Data Mart, and another joined Data Mart has no Primary Key'
    );
  });

  // The concrete phrase is the default, so a caller that says nothing gets the depth-1 wording —
  // the common case, and the one an analyst can act on.
  it('says whose rows the key matches, both ways', () => {
    const shallow = FormulaViolations.joinedMeasureMultiplied('spend', 'costs.adCost', 'Costs', [
      'traffic_source',
    ]);
    expect(shallow.message).toContain('can match several rows of this Data Mart');

    const deep = FormulaViolations.joinedMeasureMultiplied(
      'qty',
      'orders.items.qty',
      'Items',
      ['order_id'],
      undefined,
      'its parent'
    );
    expect(deep.message).toContain('can match several rows of its parent');
    expect(deep.message).not.toContain('several rows of this Data Mart');
  });

  // What the reader may not see is left out rather than half-shown: no subject, no opening token
  // for the web to mark, and a sentence that still carries the verdict.
  it('opens without a reference when the reader may not see it', () => {
    const v = FormulaViolations.joinedMeasureMultiplied('roas', undefined, 'a joined Data Mart', [
      'traffic_source',
    ]);
    expect(v.subject).toBeUndefined();
    expect(v.message).toMatch(/^A COUNT here reads a joined Data Mart, joined on `traffic_source`/);
  });

  it('says the join multiplies without a key when the key may not be named', () => {
    const v = FormulaViolations.joinedMeasureMultiplied(
      'roas',
      undefined,
      'a joined Data Mart',
      undefined,
      'a joined Data Mart',
      'its parent'
    );
    expect(v.message).toContain(
      'reached through another joined Data Mart, whose join can match several rows of its parent'
    );
    expect(v.message).not.toContain('joined on');
  });

  it('claims no missing Primary Key when it may not say whose', () => {
    const v = FormulaViolations.joinedMeasureGrainUnproven(
      'roas',
      'costs.adCost',
      'Costs',
      undefined
    );
    expect(v.message).not.toContain('Primary Key');
    expect(v.message).toContain('if several, COUNT is inflated.');
  });

  // The joined Data Mart is collapsed to one row per key before it is attached, so a COUNT over it
  // sees one match per row of this Data Mart however many joined rows share the key.
  it('says a collapsed count can come out lower, and what to count instead', () => {
    const v = FormulaViolations.joinedMeasureCollapsed(
      'orders_counted',
      'orders.order_id',
      'Orders'
    );
    expect(v.code).toBe('FORMULA_JOINED_MEASURE_COLLAPSED');
    expect(v.subject).toBe('orders.order_id');
    expect(v.message).toBe(
      '`orders.order_id` comes from `Orders`, where several rows can share one join key value — ' +
        'so COUNT counts the rows of this Data Mart they match, which can be fewer than that ' +
        "Data Mart's own rows. Use COUNT(DISTINCT ...) on a column that identifies them."
    );
  });

  it('names the ancestor whose rows collapse', () => {
    const v = FormulaViolations.joinedMeasureCollapsed(
      'orgs',
      'users.orgs.name',
      'Organizations',
      'Users',
      true
    );
    expect(v.message).toContain('`Organizations`, reached through `Users`, where several rows');
    expect(v.message).toMatch(/pick its Unique Count measure in a report\.$/);
  });

  it('names the joined Data Mart whose unmatched rows are dropped', () => {
    const v = FormulaViolations.joinedRowsExcluded('spend', ['Costs']);
    expect(v.code).toBe('FORMULA_JOINED_ROWS_EXCLUDED');
    expect(v.message).toBe(
      'This formula reads Costs through a join. Its rows that match nothing here are dropped, so ' +
        "the result may not match that Data Mart's own totals."
    );
    // No single token is to blame for an exclusion that belongs to the formula as a whole.
    expect(v.subject).toBeUndefined();
  });

  // Every hop is a `LEFT JOIN` from the main Data Mart: a main row with no counterpart survives
  // carrying NULL, and only the JOINED side's unmatched rows are dropped. Naming this Data Mart
  // among them sends an analyst hunting for rows of their own that were never missing.
  it('never names this Data Mart among the ones losing rows', () => {
    const v = FormulaViolations.joinedRowsExcluded('roas', ['Orders', 'Costs', 'Clicks']);
    expect(v.message).toContain('reads Orders, Costs and Clicks through joins. Their rows');
    expect(v.message).toContain("those Data Marts' own totals");
    expect(v.message).not.toContain('this Data Mart');
  });

  // A backtick anywhere in a SUBJECTLESS message is what the web's prose fallback reads a marker
  // target out of, and a Data Mart title is unconstrained free text.
  it('strips a backtick out of a Data Mart title rather than passing it through', () => {
    const v = FormulaViolations.joinedRowsExcluded('roas', ['Co`st`s']);
    expect(v.message).not.toContain('`');
    expect(v.message).toContain('Costs');
  });
});
