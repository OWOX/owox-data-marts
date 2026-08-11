import { describe, expect, it } from 'vitest';
import {
  canKeepUniqueCount,
  canOfferUniqueCount,
  classifyMainUniqueCountAvailability,
  readJoinedUniqueCountState,
  MAIN_UNIQUE_COUNT_AVAILABILITY_VALUES,
  uniqueCountDescription,
} from './unique-count-availability';

// `hasReportablePrimaryKey` is the caller's `getReportablePrimaryKeyFields` verdict — TRUE when a
// declared key survives the hidden/disconnected pruning, whether it is top-level or nested. It is
// the WHOLE rule: `BlendableSchemaDto.nativeFields` reaches the client with hidden top-level fields
// already stripped, so nothing in the payload separates "no key" from "hidden key".
describe('classifyMainUniqueCountAvailability', () => {
  it('is available when a declared key survives the reporting projection', () => {
    expect(classifyMainUniqueCountAvailability(true)).toBe('available');
  });

  it('withholds the metric when no key survives it', () => {
    expect(classifyMainUniqueCountAvailability(false)).toBe('primary-key-unavailable');
  });

  // Guessing a cause produced two DIFFERENT wrong explanations of the same cause: a hidden
  // top-level key read as "Primary Key is not set", a hidden nested one as "…is disconnected".
  it('offers exactly one reason, so no caller can pick a cause it cannot know', () => {
    expect(MAIN_UNIQUE_COUNT_AVAILABILITY_VALUES).toEqual(['available', 'primary-key-unavailable']);
  });

  // The joined vocabulary IS diagnosed on the backend from the raw schema, so it keeps its three
  // reasons — and none of them may leak into the main mart's verdict.
  it('never returns a joined-only verdict', () => {
    for (const reachable of [true, false]) {
      expect(['no-primary-key', 'disconnected-primary-key', 'nested-primary-key']).not.toContain(
        classifyMainUniqueCountAvailability(reachable)
      );
    }
  });
});

// What the picker's standard ⓘ shows next to the row: which Data Mart is being counted, and the
// key columns doing the counting. A report editor cannot look either up, and without them the
// number is one nobody can check.
describe('uniqueCountDescription', () => {
  it('names the joined Data Mart and its single key column', () => {
    expect(uniqueCountDescription('Users Fanout Demo', ['user_id'])).toBe(
      'Unique Users Fanout Demo records, counted by its Primary Key: user_id'
    );
  });

  // A key of several columns is simply listed. Deliberately not called "composite" — that is a
  // modelling word, and the person reading this row is not the person who declared the key.
  it('lists every column of a multi-column key, in order', () => {
    expect(uniqueCountDescription('Sessions', ['date', 'source', 'medium', 'campaign'])).toBe(
      'Unique Sessions records, counted by its Primary Key: date, source, medium, campaign'
    );
  });

  // The main Data Mart's row has no group header naming it, and the picker is never told its
  // title — so that row says which key it counts by without claiming a name it does not have.
  it('falls back to naming no Data Mart when it has none to name', () => {
    expect(uniqueCountDescription(undefined, ['id'])).toBe(
      "Unique records, counted by this Data Mart's Primary Key: id"
    );
    expect(uniqueCountDescription('   ', ['id'])).toBe(
      "Unique records, counted by this Data Mart's Primary Key: id"
    );
  });

  // With no usable key the row is already disabled and its hint explains why; a second tooltip
  // describing a count that cannot happen would contradict it.
  it('describes nothing when there is no key to count by', () => {
    expect(uniqueCountDescription('Orders', [])).toBeUndefined();
  });
});

// The two gates differ in exactly one state, and that difference is the whole point: `unknown`
// keeps what is stored (so it stays clearable) but must never invite a new selection the save
// would reject with a bare 400.
describe('canKeepUniqueCount vs canOfferUniqueCount', () => {
  it('keeps but does not offer a verdict it cannot read', () => {
    const state = readJoinedUniqueCountState('binary-primary-key');
    expect(canKeepUniqueCount(state)).toBe(true);
    expect(canOfferUniqueCount(state)).toBe(false);
  });

  it('offers a recognised failure, so the disabled row can explain itself', () => {
    const state = readJoinedUniqueCountState('no-primary-key');
    expect(canKeepUniqueCount(state)).toBe(false);
    expect(canOfferUniqueCount(state)).toBe(true);
  });

  it('does both for an available source and neither for one absent from the schema', () => {
    const available = readJoinedUniqueCountState('available');
    expect(canKeepUniqueCount(available)).toBe(true);
    expect(canOfferUniqueCount(available)).toBe(true);
    expect(canKeepUniqueCount(undefined)).toBe(false);
    expect(canOfferUniqueCount(undefined)).toBe(false);
  });
});
