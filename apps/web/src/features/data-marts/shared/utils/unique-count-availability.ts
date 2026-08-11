import {
  JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES,
  type JoinedUniqueCountAvailability,
} from '../types/relationship.types';

/**
 * Why the MAIN Data Mart can or cannot offer the Unique Count metric.
 *
 * Deliberately NOT derived from `JoinedUniqueCountAvailability`: the two are produced by different
 * backend rules that only happen to share vocabulary. The main mart is governed by
 * `getReportablePrimaryKeyFields` — both at the save gate (`UNIQUE_COUNT_REQUIRES_PRIMARY_KEY`,
 * output-controls-validator.service.ts) and in the SQL (report-sql-composer.service.ts) — which
 * prunes hidden/disconnected keys but KEEPS a nested one, emitting `COUNT(DISTINCT user.id)`. A
 * joined source is governed by `collectPrimaryKeyRowIdentity`, which does the opposite on both
 * counts. So `nested-primary-key` is not a verdict the main mart can ever be given.
 *
 * ONE failure value, unlike the joined vocabulary's three. A joined source is diagnosed on the
 * backend from the RAW schema, so it can name the cause; the main mart is diagnosed on the client
 * from `BlendableSchemaDto.nativeFields`, which the backend has already stripped of
 * `isHiddenForReporting` fields (blendable-schema.service.ts). A hidden key is therefore
 * indistinguishable from an absent one here — and guessing produced two different wrong
 * explanations for the same cause, depending only on whether the key was nested.
 */
export const MAIN_UNIQUE_COUNT_AVAILABILITY_VALUES = [
  'available',
  'primary-key-unavailable',
] as const;

export type MainUniqueCountAvailability = (typeof MAIN_UNIQUE_COUNT_AVAILABILITY_VALUES)[number];

/**
 * The main mart's verdict, tagged with the rule that produced it. The tag is what makes the two
 * rules non-interchangeable: without it the main verdicts are a subset of the joined ones, so a
 * classifier swap — which has already shipped a Critical on this feature — type-checks silently.
 */
export interface MainUniqueCountState {
  readonly scope: 'main';
  readonly availability: MainUniqueCountAvailability;
}

/**
 * A joined source's verdict as the CLIENT reads it. `unknown` is a payload value this bundle does
 * not define — a state added by a later backend, or a response cached before the field existed at
 * all. Only a joined verdict can be `unknown`; the main one is computed locally.
 */
export interface JoinedUniqueCountState {
  readonly scope: 'joined';
  readonly availability: JoinedUniqueCountAvailability | 'unknown';
}

/** Either rule's verdict. Only presentation may accept this — no rule may consume the other's. */
export type UniqueCountSourceState = MainUniqueCountState | JoinedUniqueCountState;

/** Every reason either rule can give for withholding the metric, i.e. what a hint must cover. */
export type UniqueCountUnavailableReason = Exclude<
  MainUniqueCountAvailability | JoinedUniqueCountAvailability,
  'available'
>;

export function readJoinedUniqueCountState(value: unknown): JoinedUniqueCountState {
  return {
    scope: 'joined',
    availability: (JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES as readonly unknown[]).includes(value)
      ? (value as JoinedUniqueCountAvailability)
      : 'unknown',
  };
}

export function mainUniqueCountState(
  availability: MainUniqueCountAvailability
): MainUniqueCountState {
  return { scope: 'main', availability };
}

/**
 * Whether a STORED selection may stay. Only a state the client RECOGNISES as unavailable — or the
 * source vanishing from the schema (`undefined`, the one case pruning exists for) — may take one
 * away. A value it cannot read must never destroy one: the user has no way back, and the backend
 * remains the authority that rejects a bad save.
 */
export function canKeepUniqueCount(state: UniqueCountSourceState | undefined): boolean {
  if (!state) return false;
  return state.scope === 'joined'
    ? state.availability === 'available' || state.availability === 'unknown'
    : state.availability === 'available';
}

/**
 * Whether an UNCHECKED row may be offered at all — a verdict the client can present honestly,
 * either way: `available` makes a live offer, a recognised failure makes the disabled row that
 * explains itself. `unknown` can do neither. Under version skew — a bundle newer than the backend,
 * or a backend grown a verdict this bundle predates — an active row would invite a selection the
 * save rejects with a bare 400, and a disabled row would have no cause to name.
 *
 * Strictly narrower than `canKeepUniqueCount`, and that is the point: a STORED selection on an
 * unreadable verdict still renders, so it stays clearable. Only the offer is withheld.
 */
export function canOfferUniqueCount(state: UniqueCountSourceState | undefined): boolean {
  return state !== undefined && state.availability !== 'unknown';
}

/**
 * The MAIN Data Mart's rule. `hasReportablePrimaryKey` is that decision, made by the caller from
 * the same pruned field list the picker already derives — and it is the whole rule: the payload
 * carries nothing that could tell a hidden key from an absent one (see the vocabulary above).
 */
export function classifyMainUniqueCountAvailability(
  hasReportablePrimaryKey: boolean
): MainUniqueCountAvailability {
  return hasReportablePrimaryKey ? 'available' : 'primary-key-unavailable';
}

/**
 * The metric's own description, shown through the picker's standard ⓘ. Names the Data Mart being
 * counted and the primary-key columns doing the counting — the two facts that make the number
 * checkable, and neither is something a report editor can look up from this screen.
 *
 * The key columns are simply listed. "Composite" is deliberately absent: it is a modelling word,
 * and the person reading this row is not the person who declared the key.
 *
 * `undefined` when no key is usable — the row is then disabled and its hint already explains why,
 * so a second tooltip describing a count that cannot happen would contradict it.
 */
export function uniqueCountDescription(
  dataMartName: string | undefined,
  keyFields: readonly string[]
): string | undefined {
  if (keyFields.length === 0) return undefined;
  const key = keyFields.join(', ');
  const name = dataMartName?.trim();
  return name
    ? `Unique ${name} records, counted by its Primary Key: ${key}`
    : `Unique records, counted by this Data Mart's Primary Key: ${key}`;
}
