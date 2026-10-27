import type { AvailableSource } from '../types/relationship.types';
import { aggregateFunctionLabel, UNIQUE_COUNT_LABEL } from './aggregation-labels';
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

/**
 * A run of the warning's text. Names are tagged so the popover can set them apart from the prose
 * the way the picker shows them: a Data Mart as its group header, an aggregation as its option, a
 * field as its row.
 */
export type JoinedCountWarningPart =
  | string
  | { kind: 'dataMart' | 'aggregation' | 'field'; text: string };

export interface JoinedCountWarning {
  /** What the number is not, in a line. */
  title: string;
  /** Why it drifts, and which way. */
  reason: JoinedCountWarningPart[];
  /** What to pick instead; empty when the column offers neither. */
  advice: JoinedCountWarningPart[];
}

export interface JoinedCountWarningOptions {
  /** The joined Data Mart's name as the picker shows it. */
  name: string;
  /** The report's own Data Mart's name. */
  mainName: string;
  /** The column's name as the picker shows it. */
  fieldLabel: string;
  /** The name of the joined Data Mart at another aliasPath of the same chain. */
  nameAt: (aliasPath: string) => string | undefined;
  /** Whether this column offers Count Unique. */
  offersCountUnique: boolean;
}

const dataMart = (text: string): JoinedCountWarningPart => ({ kind: 'dataMart', text });

/** Why a COUNT over a joined column does not count the joined Data Mart's rows; undefined when it does. */
export function joinedCountWarning(
  source: GrainSource | undefined,
  { name, mainName, fieldLabel, nameAt, offersCountUnique }: JoinedCountWarningOptions
): JoinedCountWarning | undefined {
  if (!source) return undefined;
  const multiplication = source.mainGrainMultiplication ?? 'unknown';
  const collapses = (source.mainGrainCollapse ?? 'collapses') === 'collapses';
  if (multiplication === 'none' && !collapses) return undefined;

  const main = mainName.trim() || "this report's Data Mart";
  const collapsedAt = source.mainGrainCollapsedAt;
  const collapsedName =
    collapsedAt && collapsedAt !== source.aliasPath ? (nameAt(collapsedAt) ?? name) : name;
  const unprovenAt = source.mainGrainUnprovenAt;
  const unprovenName =
    unprovenAt === undefined ? undefined : unprovenAt === '' ? main : nameAt(unprovenAt);

  let reason: JoinedCountWarningPart[];
  if (multiplication === 'unknown') {
    reason = [
      ...(unprovenName
        ? [dataMart(unprovenName), ' has no primary key, so']
        : ['Without a primary key,']),
      " it's unclear how many ",
      dataMart(main),
      ' rows each ',
      dataMart(name),
      ` row matches. The result can be higher${collapses ? ' or lower' : ''}.`,
    ];
  } else if (multiplication === 'multiplies' && collapses) {
    reason = [
      'One ',
      dataMart(name),
      ' row can match several ',
      dataMart(main),
      ' rows, and several ',
      dataMart(collapsedName),
      ' rows can match one, so the result can be higher or lower.',
    ];
  } else if (multiplication === 'multiplies') {
    reason = [
      'One ',
      dataMart(name),
      ' row can match several ',
      dataMart(main),
      ' rows and is counted for each, so the result can be higher.',
    ];
  } else {
    reason = [
      'Several ',
      dataMart(collapsedName),
      ' rows can match one ',
      dataMart(main),
      ' row and are counted once, so the result can be lower.',
    ];
  }

  const uniqueCount =
    readJoinedUniqueCountState(source.uniqueCountAvailability).availability === 'available';
  const addUniqueCount: JoinedCountWarningPart[] = [
    { kind: 'field', text: UNIQUE_COUNT_LABEL },
    ' from ',
    dataMart(name),
    ' to count its rows.',
  ];
  const advice: JoinedCountWarningPart[] = offersCountUnique
    ? [
        'Use ',
        { kind: 'aggregation', text: aggregateFunctionLabel('COUNT_DISTINCT') },
        ' for distinct ',
        { kind: 'field', text: fieldLabel },
        ...(uniqueCount ? [' values, or add ', ...addUniqueCount] : [' values.']),
      ]
    : uniqueCount
      ? ['Add ', ...addUniqueCount]
      : [];

  return { title: `May not match the number of ${name} rows`, reason, advice };
}
