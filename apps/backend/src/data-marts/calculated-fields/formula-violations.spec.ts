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
  unguardedDivision: FormulaViolations.unguardedDivision('ctr'),
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
});
