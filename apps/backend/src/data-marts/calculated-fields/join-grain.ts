import type {
  AvailableSourceDto,
  BlendedFieldDto,
  MainGrainCollapse,
  MainGrainMultiplication,
} from '../dto/domain/blendable-schema.dto';
import { AggregateCall } from './formula-analyzer';
import { FormulaReference } from './formula-reference';
import { FormulaViolation, FormulaViolations, UNNAMED_JOINED_SOURCE } from './formula-violations';

export interface JoinGrainSource {
  multiplication: MainGrainMultiplication;
  keyFields: readonly string[];
  /** The target side of the same chain — see `AvailableSourceDto.mainGrainCollapse`. */
  collapse: MainGrainCollapse;
  /** The joined Data Mart's title — what a message calls it, never its aliasPath. */
  title: string;
  /**
   * `title` is the neutral stand-in rather than the real one, so no part of a message may name
   * this source — not its reference, not the key of a hop hanging off it.
   */
  titleHidden: boolean;
  /**
   * This source offers the reader a Unique Count measure: it declares a usable primary key AND the
   * report would carry it (included, reportable). Independent of the verdicts: those are about the
   * join key, the measure about this source's own key.
   */
  uniqueCountAvailable: boolean;
  /**
   * How a reference to one of this source's fields is spelled for the AGENT — its published MCP
   * name. A field the map does not carry is withheld from the reader, and so is its reference.
   * Absent for the editor, where the analyst reads the `path.field` label they wrote.
   */
  fieldNames?: ReadonlyMap<string, string>;
  /** Only for 'unknown': the aliasPath of the Data Mart that declares no primary key; '' = main. */
  unprovenAt?: string;
  /**
   * Only for 'multiplies': the aliasPath of the hop that actually multiplies, which is not always
   * this source. A verdict is inherited down the chain together with the failing hop's key, so
   * `keyFields` can belong to an ANCESTOR — naming this source as the one joined on that key would
   * send an analyst to edit a relationship that is not at fault.
   */
  multipliedAt?: string;
  /** Only for 'collapses': the aliasPath of the hop whose target rows collapse. */
  collapsedAt?: string;
}

/**
 * Who reads the sentences. The ANALYST editing the formula is already looking at the join tree and
 * sees everything. The AGENT reading a saved field over MCP sees only what `resolveJoinedFields`
 * publishes to it: a source it may not report on is anonymised, and a joined field is spelled by
 * its MCP name, or not at all when it is hidden.
 */
export type JoinGrainAudience =
  | { kind: 'editor' }
  | { kind: 'agent'; blendedFields: readonly BlendedFieldDto[] };

/**
 * The verdict lookup `checkJoinGrain` reads, built from the blendable schema's own sources.
 *
 * SUBSTITUTED, never dropped. Removing an inaccessible entry looks equivalent and is not: the
 * lookup then misses, and a miss is how this module tells "inaccessible" from "no longer
 * resolvable" — the two get different treatment, and collapsing them costs the caveat its verdict.
 */
export function buildJoinGrainSources(
  sources: readonly AvailableSourceDto[],
  audience: JoinGrainAudience
): Map<string, JoinGrainSource> {
  const reportable = (source: AvailableSourceDto): boolean =>
    source.isIncluded && source.isAccessibleForReporting;
  const hidden = (source: AvailableSourceDto): boolean =>
    audience.kind === 'agent' && !reportable(source);

  const fieldNames = (source: AvailableSourceDto): Map<string, string> | undefined => {
    if (audience.kind === 'editor') return undefined;
    if (hidden(source)) return new Map();
    return new Map(
      audience.blendedFields
        .filter(f => f.aliasPath === source.aliasPath && !f.isHidden)
        .map(f => [f.originalFieldName, f.name])
    );
  };

  return new Map(
    sources.map(source => [
      source.aliasPath,
      {
        multiplication: source.mainGrainMultiplication ?? 'unknown',
        keyFields: source.mainGrainKeyFields ?? [],
        collapse: source.mainGrainCollapse ?? 'collapses',
        // `title` is typed as required, but a source whose target was saved without one would
        // otherwise put the word "undefined" into the sentence. The aliasPath is the only other
        // name a source has.
        title: hidden(source) ? UNNAMED_JOINED_SOURCE : (source.title ?? source.aliasPath),
        titleHidden: hidden(source),
        uniqueCountAvailable: reportable(source) && source.uniqueCountAvailability === 'available',
        fieldNames: fieldNames(source),
        unprovenAt: source.mainGrainUnprovenAt,
        multipliedAt: source.mainGrainMultipliedAt,
        collapsedAt: source.mainGrainCollapsedAt,
      },
    ])
  );
}

export interface JoinGrainInput {
  fieldName: string;
  aggregateCalls: readonly AggregateCall[];
  /**
   * Keyed by aliasPath. A path this map does not carry is UNRESOLVABLE, not merely unproven, and
   * draws no counting sentence at all — nothing about its grain is known.
   */
  sources: ReadonlyMap<string, JoinGrainSource>;
}

/**
 * The ONE call shape a join changes the count of: a non-DISTINCT `COUNT` over a joined Data Mart.
 *
 * Exactly `isJoinedCallLeftInPlace`'s rule in `metric-sleeve.planner.ts`, read off the same
 * `readSetQuantifier` — that predicate decides which joined call keeps no sleeve of its own. Every
 * OTHER joined aggregate is planned as a `SELECT DISTINCT (report dimensions, owner row identity,
 * value)` over the joined Data Mart's own rows with the aggregate outside it, so `SUM`/`AVG` are
 * already set-based. Asking about them here would warn about a defect the engine does not have.
 *
 * A joined `COUNT` is left in place over the joined Data Mart collapsed to one row per key, and
 * counts the MAIN rows that found a match — higher than the joined rows when a key matches several
 * main rows, lower when several joined rows share a key.
 */
function isLeftInPlace(call: AggregateCall): boolean {
  return call.name.trim().toUpperCase() === 'COUNT' && !call.distinct;
}

/** '' for a hop hanging straight off the main Data Mart. */
const parentOf = (aliasPath: string): string =>
  aliasPath.includes('.') ? aliasPath.slice(0, aliasPath.lastIndexOf('.')) : '';

export function checkJoinGrain(input: JoinGrainInput): { warnings: FormulaViolation[] } {
  const { fieldName, aggregateCalls, sources } = input;
  const warnings: FormulaViolation[] = [];

  const titleOf = (aliasPath: string): string =>
    sources.get(aliasPath)?.title ?? UNNAMED_JOINED_SOURCE;
  const isWithheld = (aliasPath: string): boolean =>
    aliasPath !== '' && sources.get(aliasPath)?.titleHidden === true;

  // One violation per OWNER: two counts over the same joined Data Mart are one problem with one
  // fix, and repeating the sentence per call buries it.
  const reported = new Set<string>();
  for (const call of aggregateCalls) {
    if (call.owner === '' || !isLeftInPlace(call) || reported.has(call.owner)) continue;

    // A path the blendable schema no longer carries — a deleted relationship, an unpublished
    // target. NOTHING is known about its grain, and a sentence about it would assert something
    // about a Data Mart it cannot see. On the save path a real error about the broken reference
    // rides along anyway.
    const source = sources.get(call.owner);
    const reference = call.references[0];
    if (source === undefined || reference === undefined) continue;
    if (source.multiplication === 'none' && source.collapse === 'none') continue;
    reported.add(call.owner);

    const ref = spell(source, reference);

    if (source.multiplication === 'unknown') {
      const at = source.unprovenAt;
      const unprovenMart =
        at === undefined || isWithheld(at) ? undefined : at === '' ? 'this Data Mart' : titleOf(at);
      warnings.push(
        FormulaViolations.joinedMeasureGrainUnproven(fieldName, ref, source.title, unprovenMart)
      );
      continue;
    }

    if (source.multiplication === 'multiplies') {
      // The hop that multiplies, when it is an ANCESTOR of the one being measured: `keyFields`
      // then belongs to that hop, and a sentence saying THIS source is joined on it names the
      // wrong relationship. An ancestor absent from the map falls back to the neutral phrase,
      // never to its aliasPath: on the MCP side an alias is exactly the token withheld.
      const failingHop = source.multipliedAt ?? call.owner;
      const multipliedBy = failingHop !== call.owner ? titleOf(failingHop) : undefined;
      // The key columns belong to the failing hop's PARENT, which past depth 1 is itself a joined
      // Data Mart — and when the reader may not see that one, its columns stay unnamed too.
      const key = isWithheld(parentOf(failingHop)) ? undefined : source.keyFields;
      // Whose rows the key matches more than one of: the main Data Mart's only while the failing
      // hop hangs straight off it; deeper down only the vaguer phrase is true.
      const rowsOf = failingHop.includes('.') ? 'its parent' : 'this Data Mart';
      warnings.push(
        FormulaViolations.joinedMeasureMultiplied(
          fieldName,
          ref,
          source.title,
          key,
          multipliedBy,
          rowsOf,
          source.uniqueCountAvailable
        )
      );
      continue;
    }

    const collapsingHop = source.collapsedAt ?? call.owner;
    warnings.push(
      FormulaViolations.joinedMeasureCollapsed(
        fieldName,
        ref,
        source.title,
        collapsingHop !== call.owner ? titleOf(collapsingHop) : undefined,
        source.uniqueCountAvailable
      )
    );
  }

  // Any joined owner, whatever the aggregate and the key: every sleeve and every dedup CTE is
  // LEFT JOINed from the main Data Mart, so a joined row that matches nothing here never reaches
  // the number. An owner the schema no longer carries has no name to give, and its aliasPath is
  // not one: on the MCP side that alias is the disclosure an inaccessible source's title is
  // withheld for.
  const joinedOwners = [...new Set(aggregateCalls.map(c => c.owner))].filter(o => o !== '');
  if (joinedOwners.length > 0) {
    warnings.push(FormulaViolations.joinedRowsExcluded(fieldName, joinedOwners.map(titleOf)));
  }

  return { warnings };
}

/** The reference as this reader may see it, or undefined when it may not see it at all. */
function spell(source: JoinGrainSource, reference: FormulaReference): string | undefined {
  if (source.fieldNames === undefined) {
    return reference.path ? `${reference.path}.${reference.field}` : reference.field;
  }
  return source.fieldNames.get(reference.field);
}

const JOINED_ROWS_EXCLUDED = 'FORMULA_JOINED_ROWS_EXCLUDED';
const COUNTING_ADVISORIES: ReadonlySet<string> = new Set([
  'FORMULA_JOINED_MEASURE_MULTIPLIED',
  'FORMULA_JOINED_MEASURE_GRAIN_UNPROVEN',
  'FORMULA_JOINED_MEASURE_COLLAPSED',
]);

/**
 * Join advisories a SAVE should not repeat: the ones about a calculated field the save did not
 * touch, which nothing in it could have changed.
 *
 * The save re-judges every formula, and an advisory no configuration can clear — the rows a join
 * drops — would otherwise come back after every unrelated edit, for every field that reads a
 * joined Data Mart. Advice that always shows is advice nobody reads. The counting advisories stay
 * for every field when the primary key changed: that is the one thing a schema save can change
 * about them, and exactly the change their "Set a Primary Key" advice asks for.
 */
export function withoutUntouchedJoinAdvisories(
  warnings: readonly FormulaViolation[],
  touchedFields: ReadonlySet<string>,
  primaryKeyChanged: boolean
): FormulaViolation[] {
  return warnings.filter(warning => {
    if (touchedFields.has(warning.field)) return true;
    if (warning.code === JOINED_ROWS_EXCLUDED) return false;
    return !COUNTING_ADVISORIES.has(warning.code) || primaryKeyChanged;
  });
}
