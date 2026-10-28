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
 * field as its row. A link to a Data Mart's Output Schema wraps the runs it covers.
 */
export type JoinedCountWarningPart =
  | string
  | { kind: 'dataMart' | 'aggregation' | 'field'; text: string }
  | { kind: 'outputSchemaLink'; dataMartId: string; parts: JoinedCountWarningPart[] };

export interface JoinedCountWarning {
  /** What the number counts, and what it does not. */
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
  /** The report's own Data Mart's id, for a link to its Output Schema. */
  mainDataMartId: string;
  /** The id of the joined Data Mart at an aliasPath of the same chain. */
  dataMartIdAt: (aliasPath: string) => string | undefined;
  /** Whether this column offers Count Unique. */
  offersCountUnique: boolean;
}

const dataMart = (text: string): JoinedCountWarningPart => ({ kind: 'dataMart', text });

/** How the text names the report's own Data Mart when it has no title to show. */
const REPORT_DATA_MART = "this report's Data Mart";

/** `several Sessions rows`, or `several rows of this report's Data Mart` without a name. */
function rowsOf(
  mart: string | undefined,
  quantity: string,
  noun: 'row' | 'rows'
): JoinedCountWarningPart[] {
  return mart
    ? [quantity, dataMart(mart), ` ${noun}`]
    : [`${quantity}${noun} of ${REPORT_DATA_MART}`];
}

/** Why a COUNT over a joined column does not count the joined Data Mart's rows; undefined when it does. */
export function joinedCountWarning(
  source: GrainSource | undefined,
  {
    name,
    mainName,
    fieldLabel,
    nameAt,
    mainDataMartId,
    dataMartIdAt,
    offersCountUnique,
  }: JoinedCountWarningOptions
): JoinedCountWarning | undefined {
  if (!source) return undefined;
  const multiplication = source.mainGrainMultiplication ?? 'unknown';
  const collapses = (source.mainGrainCollapse ?? 'collapses') === 'collapses';
  if (multiplication === 'none' && !collapses) return undefined;

  const main = mainName.trim() || undefined;
  const collapsedAt = source.mainGrainCollapsedAt;
  const collapsedName =
    collapsedAt && collapsedAt !== source.aliasPath ? (nameAt(collapsedAt) ?? name) : name;
  const thanJoinedRows: JoinedCountWarningPart[] = [
    ' than the number of ',
    dataMart(name),
    ' rows.',
  ];

  let reason: JoinedCountWarningPart[];
  if (multiplication === 'unknown') {
    // The Data Mart that declares no primary key: named, the report's own one without a name, or
    // one the picker cannot name.
    const unprovenAt = source.mainGrainUnprovenAt;
    const unprovenName = unprovenAt === '' ? main : unprovenAt && nameAt(unprovenAt);
    const unproven: JoinedCountWarningPart | undefined = unprovenName
      ? dataMart(unprovenName)
      : unprovenAt === ''
        ? REPORT_DATA_MART
        : undefined;
    const unprovenId = unprovenAt === '' ? mainDataMartId : unprovenAt && dataMartIdAt(unprovenAt);
    // "Set a primary key on X", linked to X's Output Schema when the picker knows which one it is.
    const setPrimaryKey: JoinedCountWarningPart[] =
      unproven === undefined ? [] : ['Set a primary key on ', unproven];
    const setPrimaryKeyLink: JoinedCountWarningPart[] = unprovenId
      ? [{ kind: 'outputSchemaLink', dataMartId: unprovenId, parts: setPrimaryKey }]
      : setPrimaryKey;
    const hasNoPrimaryKey: JoinedCountWarningPart[] =
      unproven === undefined
        ? []
        : [
            typeof unproven === 'string'
              ? unproven.charAt(0).toUpperCase() + unproven.slice(1)
              : unproven,
            ' has no primary key',
          ];
    if (collapses) {
      // Rows can collapse, so the count can be lower, and the missing key leaves "higher" open as
      // well. When the collapse comes from that same Data Mart having no key, setting the key can
      // settle "lower" too, so the advice says "to find out" and promises neither.
      reason = [
        'Several ',
        dataMart(collapsedName),
        ' rows can match ',
        ...rowsOf(main, 'one ', 'row'),
        ', so the count can be lower',
        ...thanJoinedRows,
        ...(unproven === undefined
          ? [' Without a primary key, it may also be higher.']
          : [
              ' ',
              ...hasNoPrimaryKey,
              ', so it may also be higher. ',
              ...setPrimaryKeyLink,
              ' to find out.',
            ]),
      ];
    } else {
      reason = [
        ...(unproven === undefined ? ['Without a primary key,'] : [...hasNoPrimaryKey, ', so']),
        " it's unclear how many ",
        ...rowsOf(main, '', 'rows'),
        ' each ',
        dataMart(name),
        ' row matches. The count can be higher',
        ...thanJoinedRows,
        ...(unproven === undefined
          ? []
          : [' ', ...setPrimaryKeyLink, ' to get a definite answer.']),
      ];
    }
  } else if (multiplication === 'multiplies' && collapses) {
    reason = [
      'One ',
      dataMart(name),
      ' row can match ',
      ...rowsOf(main, 'several ', 'rows'),
      ', and several ',
      dataMart(collapsedName),
      ' rows can match ',
      ...rowsOf(main, 'one ', 'row'),
      ', so the count can be higher or lower',
      ...thanJoinedRows,
    ];
  } else if (multiplication === 'multiplies') {
    reason = [
      'One ',
      dataMart(name),
      ' row can match ',
      ...rowsOf(main, 'several ', 'rows'),
      ', so the count can be higher',
      ...thanJoinedRows,
    ];
  } else {
    reason = [
      'Several ',
      dataMart(collapsedName),
      ' rows can match ',
      ...rowsOf(main, 'one ', 'row'),
      ', so the count can be lower',
      ...thanJoinedRows,
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

  const title = `Counts ${main ? `${main} rows` : `rows of ${REPORT_DATA_MART}`}, not ${name} rows`;
  return { title, reason, advice };
}
