import { describe, expect, it } from 'vitest';
import { DataStorageType } from '../../../../../data-storage';
import { aggregateFunctionsFor } from './formula-function-dialects';
import { SCALAR_WORD_OPERATORS, scalarFunctionsFor } from './formula-scalar-functions';

const STORAGES = ['GOOGLE_BIGQUERY', 'AWS_ATHENA', 'SNOWFLAKE', 'AWS_REDSHIFT', 'DATABRICKS'];

describe('scalarFunctionsFor', () => {
  it.each(STORAGES)('%s: returns a sorted, de-duplicated, upper-case list', storage => {
    const list = scalarFunctionsFor(storage);
    expect(list).toEqual([...new Set(list)]);
    expect(list).toEqual([...list].sort());
    expect(list.every(n => n === n.toUpperCase())).toBe(true);
  });

  // Strictly under, not "at most": the module caps with `.slice(0, 100)`, so
  // `toBeLessThanOrEqual(100)` would assert a property of `slice` and could never fail — the first
  // contributor to push a dialect past the cap would silently lose the tail of their list with a
  // green suite. A failure here means the curated union has reached the cap: raise
  // MAX_SUGGESTIONS_PER_STORAGE or cut the low-priority tail deliberately, do not relax this bound.
  it.each(STORAGES)('%s: stays inside the suggestion cap with nothing silently cut', storage => {
    expect(scalarFunctionsFor(storage).length).toBeLessThan(100);
  });

  it.each(STORAGES)('%s: never repeats an aggregate name', storage => {
    const aggregates = new Set(aggregateFunctionsFor(storage));
    expect(scalarFunctionsFor(storage).filter(n => aggregates.has(n))).toEqual([]);
  });

  // The spec's version of this test also demanded `IF` everywhere. It does not exist everywhere:
  // Snowflake spells it `IFF` and Redshift has no such function at all, so the three that ARE
  // universal are asserted everywhere and `IF` is asserted where it is real.
  it('offers the conditionals each dialect actually has', () => {
    for (const storage of STORAGES) {
      expect(scalarFunctionsFor(storage)).toEqual(
        expect.arrayContaining(['CASE', 'COALESCE', 'NULLIF'])
      );
    }

    expect(scalarFunctionsFor(DataStorageType.GOOGLE_BIGQUERY)).toContain('IF');
    expect(scalarFunctionsFor(DataStorageType.AWS_ATHENA)).toContain('IF');
    expect(scalarFunctionsFor(DataStorageType.DATABRICKS)).toContain('IF');

    expect(scalarFunctionsFor(DataStorageType.SNOWFLAKE)).not.toContain('IF');
    expect(scalarFunctionsFor(DataStorageType.SNOWFLAKE)).toContain('IFF');
    expect(scalarFunctionsFor(DataStorageType.AWS_REDSHIFT)).not.toContain('IF');
    expect(scalarFunctionsFor(DataStorageType.AWS_REDSHIFT)).toContain('DECODE');
  });

  it('returns an empty list for an unknown storage rather than guessing a dialect', () => {
    expect(scalarFunctionsFor('NOT_A_STORAGE')).toEqual([]);
  });

  // The legacy BigQuery storage runs the same warehouse; `aggregateFunctionsFor` already treats the
  // two as one dialect, and a suggestion list that forgot it would leave those Data Marts with
  // nothing at all — which the empty-for-unknown rule above makes silent rather than loud.
  it('treats legacy BigQuery as BigQuery', () => {
    expect(scalarFunctionsFor(DataStorageType.LEGACY_GOOGLE_BIGQUERY)).toEqual(
      scalarFunctionsFor(DataStorageType.GOOGLE_BIGQUERY)
    );
  });

  // Same reasoning as `aggregateFunctionsFor`'s own cross-dialect test: a name from the wrong
  // warehouse costs the analyst a failed dry run they cannot connect to the suggestion they took.
  it('does not spill one warehouse’s spelling into another', () => {
    expect(scalarFunctionsFor(DataStorageType.GOOGLE_BIGQUERY)).toContain('SAFE_DIVIDE');
    expect(scalarFunctionsFor(DataStorageType.SNOWFLAKE)).not.toContain('SAFE_DIVIDE');
    expect(scalarFunctionsFor(DataStorageType.SNOWFLAKE)).toContain('IFF');
    expect(scalarFunctionsFor(DataStorageType.AWS_REDSHIFT)).not.toContain('IFF');
    expect(scalarFunctionsFor(DataStorageType.DATABRICKS)).toContain('TRY_DIVIDE');
    expect(scalarFunctionsFor(DataStorageType.AWS_ATHENA)).not.toContain('TRY_DIVIDE');
  });

  // Membership is per name, not per dialect, so the invariant is that none of them is a dead
  // entry — a word nobody offers inserts nowhere, and a typo in this list would look exactly like
  // that.
  it('offers every word operator on at least one storage', () => {
    const offered = new Set(STORAGES.flatMap(storage => [...scalarFunctionsFor(storage)]));

    for (const word of SCALAR_WORD_OPERATORS) {
      expect([...offered]).toContain(word);
    }
  });

  it('offers the logical and CASE words on every storage', () => {
    const everywhere = ['AND', 'OR', 'NOT', 'IS NULL', 'IS NOT NULL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IN']; // prettier-ignore

    for (const storage of STORAGES) {
      expect(scalarFunctionsFor(storage)).toEqual(expect.arrayContaining(everywhere));
    }
  });

  // The list may be incomplete; it may not be wrong. Trino (Athena) and Redshift reject the
  // parenthesised form of these outright, so completing them as `NAME()` — which is what every
  // other scalar entry does — bought a save-and-reject round trip on the editor's own suggestion.
  it('inserts the niladic date functions bare, and the real functions beside them as calls', () => {
    expect(SCALAR_WORD_OPERATORS).toEqual(
      expect.arrayContaining(['CURRENT_DATE', 'CURRENT_TIMESTAMP', 'SYSDATE'])
    );
    expect(scalarFunctionsFor(DataStorageType.AWS_ATHENA)).toContain('CURRENT_TIMESTAMP');
    expect(scalarFunctionsFor(DataStorageType.AWS_REDSHIFT)).toContain('SYSDATE');

    // `NOW()` and `GETDATE()` are ordinary functions wherever they are offered, and putting them
    // in the set above would break them in the opposite direction.
    expect(SCALAR_WORD_OPERATORS).not.toContain('NOW');
    expect(SCALAR_WORD_OPERATORS).not.toContain('GETDATE');
  });
});

const BQ = DataStorageType.GOOGLE_BIGQUERY;
const AT = DataStorageType.AWS_ATHENA;
const SF = DataStorageType.SNOWFLAKE;
const RS = DataStorageType.AWS_REDSHIFT;
const DB = DataStorageType.DATABRICKS;

/**
 * Names every one of the five warehouses documents AND runs over user tables — Redshift's
 * leader-node-only functions fail that second half, which is what took `CURRENT_TIMESTAMP`, `LOG`
 * and `LN` off this list. Being here is what earns a name a place in the module's shared set, since
 * the shared set is offered to all five at once.
 */
const UNIVERSAL = [
  'ABS',
  'AND',
  'CASE',
  'CAST',
  'CEIL',
  'COALESCE',
  'CONCAT',
  'CURRENT_DATE',
  'DATE_TRUNC',
  'ELSE',
  'END',
  'EXP',
  'EXTRACT',
  'FLOOR',
  'GREATEST',
  'IN',
  'IS NOT NULL',
  'IS NULL',
  'LEAST',
  'LENGTH',
  'LOWER',
  'LPAD',
  'LTRIM',
  'MOD',
  'NOT',
  'NULLIF',
  'OR',
  'POWER',
  'REGEXP_REPLACE',
  'REPLACE',
  'REVERSE',
  'ROUND',
  'RPAD',
  'RTRIM',
  'SIGN',
  'SQRT',
  'THEN',
  'TRANSLATE',
  'TRIM',
  'UPPER',
  'WHEN',
];

/**
 * Where each NON-universal name is documented — the traps, checked one by one in each warehouse's
 * own function reference. Read it as a claim about the warehouses, not about our lists: a name may
 * legitimately be documented somewhere we choose not to offer it (a curation call), but it may
 * never be offered where it is not documented (a lie the analyst pays for at dry-run time).
 *
 * Only names offered by more than one storage need an entry. A name offered by exactly one was, by
 * construction, taken from that one warehouse's reference and has nowhere to leak to.
 */
const SUPPORTED_BY: Partial<Record<string, DataStorageType[]>> = {
  // Conditionals and null handling — the densest patch of dialect-specific spellings.
  IF: [BQ, AT, DB], // Snowflake has IFF; Redshift has none.
  IFNULL: [BQ, SF, DB],
  NVL: [SF, RS, DB],
  NVL2: [SF, RS, DB],
  DECODE: [SF, RS, DB], // Databricks documents it too; we offer Snowflake's and Redshift's.
  TRY_CAST: [AT, SF, DB], // BigQuery spells it SAFE_CAST; Redshift has neither.

  // Casting and conversion.
  DATE: [BQ, AT, SF, DB],
  TO_DATE: [SF, RS, DB],
  TO_TIMESTAMP: [SF, RS, DB],
  TO_NUMBER: [SF, RS],
  TRY_TO_TIMESTAMP: [SF, DB],

  // Date and time.
  // Redshift documents CURRENT_TIMESTAMP as a DEPRECATED LEADER-NODE-ONLY function ("Use GETDATE
  // function or SYSDATE instead"), and a leader-node function errors in any query that touches user
  // tables — which a calculated field always does. Documented is not the same as usable.
  CURRENT_TIMESTAMP: [BQ, AT, SF, DB],
  DATE_ADD: [BQ, AT, DB],
  DATE_SUB: [BQ, DB],
  DATE_DIFF: [BQ, AT], // Snowflake, Redshift and Databricks spell it DATEDIFF.
  DATEADD: [SF, RS, DB],
  DATEDIFF: [SF, RS, DB],
  DATE_PART: [SF, RS, DB],
  DATE_FORMAT: [AT, DB],
  LAST_DAY: [BQ, SF, RS, DB], // Trino spells it LAST_DAY_OF_MONTH.
  ADD_MONTHS: [SF, RS, DB],
  MONTHS_BETWEEN: [SF, RS, DB],
  CONVERT_TIMEZONE: [SF, RS],
  FROM_UNIXTIME: [AT, DB],
  NOW: [AT, DB],
  YEAR: [AT, SF, DB],
  QUARTER: [AT, SF, DB],
  MONTH: [AT, SF, DB],
  WEEK: [AT, SF],
  DAY: [AT, SF, DB],
  HOUR: [AT, SF, DB],
  MINUTE: [AT, SF, DB],
  SECOND: [AT, SF, DB],
  DAYOFWEEK: [SF, DB], // Trino spells it DAY_OF_WEEK.

  // Strings.
  // Redshift DOES document SUBSTR — on the leader-node-only list, so it errors over table data.
  // SUBSTRING, which Redshift documents normally, is what its analysts get instead.
  SUBSTR: [BQ, AT, SF, DB],
  SUBSTRING: [AT, SF, RS, DB],
  LEFT: [BQ, SF, RS, DB], // Trino has neither LEFT nor RIGHT.
  RIGHT: [BQ, SF, RS, DB],
  SPLIT: [BQ, AT, SF, DB],
  SPLIT_PART: [AT, SF, RS, DB],
  POSITION: [AT, SF, RS, DB],
  STRPOS: [BQ, AT, RS],
  CHARINDEX: [SF, RS],
  INSTR: [BQ, DB],
  CHAR_LENGTH: [BQ, RS, DB],
  INITCAP: [BQ, SF, RS, DB],
  CONTAINS: [AT, SF, DB],
  STARTSWITH: [SF, DB], // BigQuery and Trino use the underscored STARTS_WITH.
  ENDSWITH: [SF, DB],
  REGEXP_EXTRACT: [BQ, AT, DB],
  REGEXP_LIKE: [AT, SF],
  REGEXP_SUBSTR: [SF, RS],
  FORMAT: [BQ, AT],

  // Numbers.
  TRUNC: [BQ, SF, RS, DB], // Trino has TRUNCATE instead.
  TRUNCATE: [AT, SF],
  CEILING: [BQ, AT, RS, DB], // Snowflake documents CEIL only.
  POW: [BQ, AT, DB],
  LOG10: [BQ, AT, DB],
  RAND: [BQ, DB],
  RANDOM: [AT, SF, RS, DB],
  // AWS contradicts itself: LOG appears on the leader-node-only math list, while its own reference
  // page shows a bare `SELECT LOG(2, 100)` with no such note. Unresolvable without a live cluster,
  // so the module's own rule applies — narrow. Redshift gets DLOG10, whose page carries no note —
  // though AWS also calls DLOG10 a "Synonym of LOG function", so in truth either both are
  // compute-node-safe or both are suspect. The note-free page is the only evidence either way.
  LOG: [BQ, AT, SF, DB],
  // LN's restriction hides on its own page, not the leader-node index: over a user-created table it
  // errors for BOOLEAN, CHAR, DATE, DECIMAL/NUMERIC, TIMESTAMP and VARCHAR arguments — and DECIMAL
  // is what a revenue column is, so `LN(revenue)` is the failing case, not an exotic one. Redshift
  // gets DLOG1 (documented as LN's synonym, page note-free) with the same caveat as DLOG10 above.
  LN: [BQ, AT, SF, DB],

  // Semi-structured.
  JSON_EXTRACT_SCALAR: [BQ, AT],
  JSON_PARSE: [AT, RS],
  ELEMENT_AT: [AT, DB],
};

/**
 * Suggestion-only means the list cannot break a formula; it does not mean the list may lie. These
 * pin the specific way it would: a name that is right on one warehouse being offered on another
 * that lacks it, which costs the analyst a round trip (type it, save, watch the dry run reject a
 * function this editor recommended).
 *
 * What they do NOT check — deliberately, so nobody reads more into a green run than is there: a
 * name offered by exactly one storage is exempt from the table, so an invented function in a single
 * dialect's list passes. That is the error nobody makes; copying a real name onto the wrong
 * warehouse is the error people do make, and that is the one pinned here.
 */
describe('scalarFunctionsFor: no name crosses into a dialect that lacks it', () => {
  const offeredBy = new Map<string, DataStorageType[]>();
  for (const storage of STORAGES) {
    for (const name of scalarFunctionsFor(storage)) {
      offeredBy.set(name, [...(offeredBy.get(name) ?? []), storage as DataStorageType]);
    }
  }

  it.each(STORAGES)('%s: offers only names that warehouse documents', storage => {
    const undocumented = scalarFunctionsFor(storage).filter(name => {
      if (UNIVERSAL.includes(name)) return false;
      const supported = SUPPORTED_BY[name];
      // No entry is a claim in itself: the name is offered by this storage alone, so it came from
      // this warehouse's own reference (see SUPPORTED_BY's note).
      if (!supported) return offeredBy.get(name)?.length !== 1;
      return !supported.includes(storage as DataStorageType);
    });

    expect(undocumented).toEqual([]);
  });

  it('records where every name offered by more than one warehouse is documented', () => {
    const unrecorded = [...offeredBy.entries()]
      .filter(([, storages]) => storages.length > 1)
      .filter(([name]) => !UNIVERSAL.includes(name) && !SUPPORTED_BY[name])
      .map(([name]) => name);

    // Failing here means: go read the references and say which warehouses document this name.
    expect(unrecorded).toEqual([]);
  });

  // A CHANGE DETECTOR, not a verification. `SHARED_SCALAR` is offered to all five by construction,
  // so this reduces to "the module's shared set and UNIVERSAL say the same thing" — it forces an
  // edit in two places and, with it, the moment where someone asks "is this really universal?", but
  // it cannot answer that question. `CURRENT_TIMESTAMP` sat in both lists through a full review
  // before AWS's leader-node-only note surfaced: green here, wrong in the product.
  it('offers a name on every storage only when every storage documents it', () => {
    const offeredEverywhere = [...offeredBy.entries()]
      .filter(([, storages]) => storages.length === STORAGES.length)
      .map(([name]) => name)
      .sort();

    // Set equality both ways: a non-portable name added to the module's shared set shows up here as
    // an extra, and a universal name dropped from it shows up as a miss.
    expect(offeredEverywhere).toEqual([...UNIVERSAL].sort());
  });

  // Fires only on an entry that already names all five, so it catches a mis-filed name, never an
  // under-offered one: a name we curated into a single dialect's extras that all five actually
  // document is invisible to it. `TRANSLATE` (Redshift-only here, universal in truth) was found by
  // reading, not by this test.
  it('promotes a name documented everywhere into the shared set instead of five extras lists', () => {
    const universalButListedAsPartial = Object.entries(SUPPORTED_BY)
      .filter(([, storages]) =>
        STORAGES.every(s => (storages ?? []).includes(s as DataStorageType))
      )
      .map(([name]) => name);

    expect(universalButListedAsPartial).toEqual([]);
  });
});
