import type { ErdFieldRowLabels } from './erd-fields';

/**
 * What each card shows on a canvas. A per-browser view preference (not model
 * data), ported from the standalone OWOX Model Canvas (owox/models).
 *
 * Each part hides exactly one thing on the card, so any combination is
 * expressible. Stored as the set of HIDDEN parts: the empty set means "show
 * everything", and a part added later defaults to visible for everyone who
 * already has a preference stored.
 *
 * Every canvas offers only the parts its cards have (see
 * {@link ObjectLabelOption}); `fieldAlias` and `fieldDescription` are the
 * optional lines under each field row, so they only matter in the Detailed view.
 */
export type ObjectLabelPart =
  | 'source'
  | 'fields'
  | 'triggers'
  | 'reports'
  | 'relationships'
  | 'status'
  | 'footer'
  | 'fieldAlias'
  | 'fieldDescription';
export type ObjectLabelsHidden = Readonly<Record<ObjectLabelPart, boolean>>;

export const OBJECT_LABEL_PARTS: readonly ObjectLabelPart[] = [
  'source',
  'fields',
  'triggers',
  'reports',
  'relationships',
  'status',
  'footer',
  'fieldAlias',
  'fieldDescription',
];

/** The parts that change the field rows — offered in the Detailed view only. */
export const FIELD_ROW_PARTS: readonly ObjectLabelPart[] = ['fieldAlias', 'fieldDescription'];

/** One checkbox of a canvas's settings: the part it hides, and how the menu names it. */
export interface ObjectLabelOption {
  part: ObjectLabelPart;
  label: string;
  helper: string;
}

export const NOTHING_HIDDEN: ObjectLabelsHidden = {
  source: false,
  fields: false,
  triggers: false,
  reports: false,
  relationships: false,
  status: false,
  footer: false,
  fieldAlias: false,
  fieldDescription: false,
};

export const ALL_HIDDEN: ObjectLabelsHidden = {
  source: true,
  fields: true,
  triggers: true,
  reports: true,
  relationships: true,
  status: true,
  footer: true,
  fieldAlias: true,
  fieldDescription: true,
};

/**
 * Written with every preference. A stored value without it predates the
 * per-badge parts, when hiding source, fields and status meant "title only".
 */
const VERSION_TOKEN = 'v2';
const LEGACY_TITLE_ONLY_PARTS: readonly ObjectLabelPart[] = ['source', 'fields', 'status'];
const PARTS_ADDED_IN_V2: readonly ObjectLabelPart[] = [
  'triggers',
  'reports',
  'relationships',
  'footer',
];

function isPart(value: string): value is ObjectLabelPart {
  return (OBJECT_LABEL_PARTS as readonly string[]).includes(value);
}

/** Parse the persisted CSV of hidden parts; unknown tokens are ignored. */
export function parseObjectLabelsHidden(csv: string | null): ObjectLabelsHidden {
  if (csv === null) return NOTHING_HIDDEN;
  const hidden: Record<ObjectLabelPart, boolean> = { ...NOTHING_HIDDEN };
  const tokens = csv.split(',').map(token => token.trim());
  for (const token of tokens) {
    if (isPart(token)) hidden[token] = true;
  }
  // An old "title only" preference keeps the card down to its title.
  if (!tokens.includes(VERSION_TOKEN) && LEGACY_TITLE_ONLY_PARTS.every(part => hidden[part])) {
    for (const part of PARTS_ADDED_IN_V2) hidden[part] = true;
  }
  return hidden;
}

export function serializeObjectLabelsHidden(hidden: ObjectLabelsHidden): string {
  return [VERSION_TOKEN, ...OBJECT_LABEL_PARTS.filter(part => hidden[part])].join(',');
}

export function toggleObjectLabelPart(
  hidden: ObjectLabelsHidden,
  part: ObjectLabelPart
): ObjectLabelsHidden {
  return { ...hidden, [part]: !hidden[part] };
}

/** The Detailed-view half of the preference, in the shape the field rows consume. */
export function toFieldRowLabels(hidden: ObjectLabelsHidden): ErdFieldRowLabels {
  return { alias: !hidden.fieldAlias, description: !hidden.fieldDescription };
}
