import type { AvailableSource } from '../types/relationship.types';
import { readJoinedUniqueCountState } from './unique-count-availability';

type GrainSource = Partial<
  Pick<
    AvailableSource,
    | 'aliasPath'
    | 'mainGrainMultiplication'
    | 'mainGrainCollapse'
    | 'mainGrainUnprovenAt'
    | 'mainGrainCollapsedAt'
    | 'uniqueCountAvailability'
  >
>;

export interface JoinedCountWarningOptions {
  /** The joined Data Mart's name as the picker shows it. */
  name: string;
  /** The name of the joined Data Mart at another aliasPath of the same chain. */
  nameAt: (aliasPath: string) => string | undefined;
  /** Whether this column offers Count Unique. */
  offersCountUnique: boolean;
}

/** Why a COUNT over a joined column does not count the joined Data Mart's rows; undefined when it does. */
export function joinedCountWarning(
  source: GrainSource | undefined,
  { name, nameAt, offersCountUnique }: JoinedCountWarningOptions
): string | undefined {
  if (!source) return undefined;
  const multiplication = source.mainGrainMultiplication ?? 'unknown';
  const collapses = (source.mainGrainCollapse ?? 'collapses') === 'collapses';
  if (multiplication === 'none' && !collapses) return undefined;

  const collapsedAt = source.mainGrainCollapsedAt;
  const collapsedName =
    collapsedAt && collapsedAt !== source.aliasPath ? (nameAt(collapsedAt) ?? name) : name;
  const unprovenAt = source.mainGrainUnprovenAt;
  const unprovenName =
    unprovenAt === undefined
      ? undefined
      : unprovenAt === ''
        ? "This report's Data Mart"
        : nameAt(unprovenAt);

  const lead = `Count counts the rows of this report's Data Mart that have a match in ${name}, not the rows of ${name}.`;
  let reason: string;
  if (multiplication === 'unknown') {
    reason =
      (unprovenName ? ` ${unprovenName} has no primary key, so` : ' Without a primary key') +
      ` it can't be checked whether one ${name} row matches one row or several: the count can be higher` +
      (collapses ? ' or lower.' : '.');
  } else if (multiplication === 'multiplies' && collapses) {
    reason = ` One ${name} row can match several of them, and several ${collapsedName} rows can share one join key value, so the count can be higher or lower.`;
  } else if (multiplication === 'multiplies') {
    reason = ` One ${name} row can match several of them, so the count can be higher.`;
  } else {
    reason = ` Several ${collapsedName} rows can share one join key value, so the count can be lower.`;
  }

  const uniqueCount =
    readJoinedUniqueCountState(source.uniqueCountAvailability).availability === 'available';
  const advice = offersCountUnique
    ? ' Count Unique counts distinct values of this column instead' +
      (uniqueCount ? `, and the Unique Count of ${name} counts its rows.` : '.')
    : uniqueCount
      ? ` The Unique Count of ${name} counts its rows.`
      : '';
  return lead + reason + advice;
}
