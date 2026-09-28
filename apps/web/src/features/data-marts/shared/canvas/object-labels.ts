import type { ErdFieldRowLabels } from './erd-fields';

/**
 * What each ERD card shows on the Models canvas. A per-browser view preference
 * (not model data), ported from the standalone OWOX Model Canvas (owox/models).
 *
 * The parts toggle independently, so any combination is expressible (e.g. keep
 * the field count but drop the status dot). Stored as the set of HIDDEN parts:
 * the empty set means "show everything", and a part added later defaults to
 * visible for everyone who already has a preference stored.
 *
 * `source`, `fields` and `status` shape the card header; `fieldAlias` and
 * `fieldDescription` are the optional lines under each field row, so they only
 * show in the Detailed view.
 */
export type ObjectLabelPart = 'source' | 'fields' | 'status' | 'fieldAlias' | 'fieldDescription';
export type ObjectLabelsHidden = Readonly<Record<ObjectLabelPart, boolean>>;

/** The parts that shape the card header — hiding all of them is "title only". */
export const CARD_HEADER_PARTS: readonly ObjectLabelPart[] = ['source', 'fields', 'status'];
export const OBJECT_LABEL_PARTS: readonly ObjectLabelPart[] = [
  ...CARD_HEADER_PARTS,
  'fieldAlias',
  'fieldDescription',
];

export const NOTHING_HIDDEN: ObjectLabelsHidden = {
  source: false,
  fields: false,
  status: false,
  fieldAlias: false,
  fieldDescription: false,
};
export const ALL_HIDDEN: ObjectLabelsHidden = {
  source: true,
  fields: true,
  status: true,
  fieldAlias: true,
  fieldDescription: true,
};

function isPart(value: string): value is ObjectLabelPart {
  return (OBJECT_LABEL_PARTS as readonly string[]).includes(value);
}

/** Parse the persisted CSV of hidden parts; unknown tokens are ignored. */
export function parseObjectLabelsHidden(csv: string | null): ObjectLabelsHidden {
  if (csv === null) return NOTHING_HIDDEN;
  const hidden: Record<ObjectLabelPart, boolean> = { ...NOTHING_HIDDEN };
  for (const token of csv.split(',')) {
    const part = token.trim();
    if (isPart(part)) hidden[part] = true;
  }
  return hidden;
}

export function serializeObjectLabelsHidden(hidden: ObjectLabelsHidden): string {
  return OBJECT_LABEL_PARTS.filter(part => hidden[part]).join(',');
}

export function toggleObjectLabelPart(
  hidden: ObjectLabelsHidden,
  part: ObjectLabelPart
): ObjectLabelsHidden {
  return { ...hidden, [part]: !hidden[part] };
}

export function isNothingHidden(hidden: ObjectLabelsHidden): boolean {
  return OBJECT_LABEL_PARTS.every(part => !hidden[part]);
}

/**
 * Title-only mode: every header part is hidden. Judged on the header parts
 * alone so a preference saved before the field-row parts existed still counts.
 */
export function isTitleOnly(hidden: ObjectLabelsHidden): boolean {
  return CARD_HEADER_PARTS.every(part => hidden[part]);
}

/** Every part hidden — what the "Uncheck all" shortcut produces. */
export function isAllHidden(hidden: ObjectLabelsHidden): boolean {
  return OBJECT_LABEL_PARTS.every(part => hidden[part]);
}

/** The Detailed-view half of the preference, in the shape the field rows consume. */
export function toFieldRowLabels(hidden: ObjectLabelsHidden): ErdFieldRowLabels {
  return { alias: !hidden.fieldAlias, description: !hidden.fieldDescription };
}
