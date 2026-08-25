/**
 * The fields a calculated-field formula on THIS Data Mart may reference, and the lookup from a
 * typed name back to one of them.
 *
 * Mirrors the backend's `collectFormulaReferenceableFields`, calculated fields included. What this
 * index adds is the referenced field's LEVEL, which decides how it may be written: an
 * aggregate-level one is legal bare and refused inside an aggregation, a row-level one the reverse.
 *
 * Joined fields come from the blendable schema instead, and `buildJoinedReferenceIndex` mirrors the
 * backend's on which of them resolve — including three deliberate asymmetries: a joined field
 * HIDDEN for reporting is refused, a source EXCLUDED from reporting is still referenceable, and a
 * joined CALCULATED field stays refused where an own one is allowed.
 */

import {
  DataMartSchemaFieldStatus,
  type BaseSchemaField,
  type CalculatedFieldLevel,
} from '../../../../shared/types/data-mart-schema.types';

/**
 * A schema field as this module needs to see it. Every concrete per-storage field type
 * (BigQuery, Athena, Snowflake, Redshift, Databricks) structurally satisfies this — only
 * BigQuery ever nests, so the recursion below is a no-op for the rest.
 */
export interface SchemaField extends BaseSchemaField {
  fields?: readonly SchemaField[];
}

/**
 * A joined Data Mart's field as this module needs to see it — the subset of `BlendedField`
 * (relationship.types.ts) that decides whether a formula may name it and how. Structural, not the
 * DTO itself, so this module keeps depending on nothing but its own inputs.
 */
export interface JoinedSchemaField {
  /** The joined source's aliasPath, e.g. `orders` or `orders.items`. */
  aliasPath: string;
  /** The field's name in its own Data Mart — what a `{{ref}}` tag's `field` carries. */
  originalFieldName: string;
  type: string;
  isHidden: boolean;
  /**
   * Whether the field is a calculated field of ITS Data Mart. Optional: a blendable-schema
   * response cached before the backend sent it carries none, and an absent flag means "not
   * calculated" — the same fail-open default the backend's own index takes.
   */
  isCalculated?: boolean;
  /** The joined Data Mart's display name (its blend alias, or its title). */
  outputPrefix?: string;
  sourceDataMartTitle?: string;
}

export interface ReferenceableField {
  /** What the analyst types and sees — the field's dotted path. */
  name: string;
  /** aliasPath relative to the metric's own Data Mart; '' means that Data Mart itself. */
  path: string;
  /** The name a `{{ref field="…"}}` tag carries: the field's name within the Data Mart `path` names. */
  field: string;
  type: string;
  isHidden: boolean;
  /** Which Data Mart this field comes from, for autocomplete. Absent on own-Data-Mart fields. */
  sourceLabel?: string;
  /**
   * Present on a CALCULATED field of this Data Mart, and the marker that it is one — absent on
   * every other entry, joined ones included (a joined calculated field is never offered at all).
   *
   * Its `level` is carried VERBATIM, so it is absent for a formula applied in this session, whose
   * level no save has derived yet. Not resolved here, because the two consumers want different
   * things from not knowing: a menu label may take the quiet guess, a hover sentence that rules
   * something out may not.
   */
  calculated?: { level?: CalculatedFieldLevel };
}

/**
 * A field is reachable by a formula when it is either calculated (never sourced from the
 * warehouse, so no status of its own can take it away) or not DISCONNECTED. Same rule as the
 * backend's `isConnected` in data-mart-schema.utils.ts.
 */
function isReachable(field: SchemaField): boolean {
  if (field.calculated) return true;
  return field.status !== DataMartSchemaFieldStatus.DISCONNECTED;
}

/**
 * A nameless field is a real state — "Add calculated field" appends a row whose name is typed
 * afterwards — and an empty name matches the empty string at every boundary in the formula:
 * `resolveAll` returns zero-length references and `toStoredForm` splices `{{ref field=""}}` into
 * each. Whitespace-only for the same reason.
 *
 * Checked rather than trusted although `name` is required: these are plain interfaces over a cast
 * API response, and a `TypeError` from the `useMemo` here would blank the whole schema table.
 */
function isNameable(field: SchemaField): boolean {
  return typeof field.name === 'string' && field.name.trim() !== '';
}

/**
 * Every field a formula on THIS Data Mart may reference.
 *
 * Hidden fields ARE offered — hiding takes a column off the reporting menu, not out of the source,
 * and computing is not projecting. Calculated fields are offered too, carrying their level.
 * Disconnected ones are NOT: they are gone from the warehouse, subtree included.
 *
 * A field's own name is offered to its own formula, deliberately: the backend answers a
 * self-reference with "`roas` references itself, so it has no value to compute", which it can only
 * do for a name it RESOLVED. Filtered out here, the same formula returns as a bare unknown word.
 */
export function buildReferenceIndex(fields: readonly SchemaField[]): ReferenceableField[] {
  const out: ReferenceableField[] = [];

  const walk = (nodes: readonly SchemaField[], prefix: string): void => {
    for (const field of nodes) {
      if (!isReachable(field) || !isNameable(field)) continue;
      const name = prefix ? `${prefix}.${field.name}` : field.name;
      out.push({
        name,
        path: '',
        field: name,
        type: field.type,
        isHidden: Boolean(field.isHiddenForReporting),
        ...(field.calculated
          ? { calculated: field.calculated.level ? { level: field.calculated.level } : {} }
          : {}),
      });
      if (field.fields?.length) walk(field.fields, name);
    }
  };

  walk(fields, '');
  return out;
}

/**
 * Every field of the JOINED Data Marts a formula on this one may reference, offered under the
 * dotted name `<aliasPath>.<field>`.
 *
 * Built from the STRUCTURAL alias path, never the source's display name: each segment is validated
 * against `^[a-z0-9_]+$`, while a display name is free-form text that would not be typeable as SQL.
 *
 * Hidden fields are NOT offered — the opposite of the own-Data-Mart rule above, because the save
 * refuses a joined reference to one.
 */
/**
 * Both candidates are free-form text stored exactly as typed, so a whitespace-only one falls
 * through to the next rather than labelling the field with padding.
 */
function sourceLabelOf(field: JoinedSchemaField): string | undefined {
  for (const candidate of [field.outputPrefix, field.sourceDataMartTitle]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function buildJoinedReferenceIndex(
  fields: readonly JoinedSchemaField[]
): ReferenceableField[] {
  const out: ReferenceableField[] = [];
  for (const field of fields) {
    // NOT the own-Data-Mart rule above, and the difference is deliberate: the refusal is
    // lifted for the metric's OWN mart only. A JOINED formula is still answered with
    // FORMULA_CALCULATED_REFERENCE — its text never crosses the wire to be substituted, and
    // routing and `assertAllRequestedSourcesAccessible` are both decided from THIS formula's raw
    // text, so a source reachable only through it would be joined without being access-checked.
    // Offering one would resolve cleanly in the editor and then 400 at save.
    if (field.isCalculated) continue;
    if (field.isHidden) continue;
    // An empty aliasPath would make the entry indistinguishable from an own-Data-Mart field, both
    // in the precedence rule below and in the tag written for it.
    if (!field.aliasPath) continue;
    out.push({
      name: `${field.aliasPath}.${field.originalFieldName}`,
      path: field.aliasPath,
      field: field.originalFieldName,
      type: field.type,
      isHidden: false,
      sourceLabel: sourceLabelOf(field),
    });
  }
  return out;
}

/**
 * A typed name resolved against the index, or why it could not be. Two distinct fields can
 * legitimately share a dotted `name` — a top-level field literally called `payload.value` alongside
 * a struct `payload` with a child `value` both produce the name `payload.value` — so 'ambiguous' is
 * a real outcome the editor must handle, not a state a stricter index could design away.
 */
export type ResolvedTypedName = ReferenceableField | 'unknown' | 'ambiguous';

/** Every offered name, already resolved. Built by `buildNameIndex`, read by `resolveTypedName`. */
export type ReferenceNameIndex = ReadonlyMap<string, ReferenceableField | 'ambiguous'>;

/**
 * Collapses the offered fields into one lookup from typed name to the field it resolves to.
 *
 * Built ONCE per resolution pass: the editor re-resolves on every keystroke, and a wide join tree
 * reaches four figures of entries, so a per-name scan is quadratic work per character typed.
 *
 * Precedence in one place: OWN-Data-Mart fields win. A RECORD `orders` with a subfield `amount` and
 * a Data Mart joined under the alias `orders` both produce `orders.amount`. Only a collision WITHIN
 * the winning group is ambiguous, and neither candidate is guessed.
 */
export function buildNameIndex(fields: readonly ReferenceableField[]): ReferenceNameIndex {
  const hitsByName = new Map<string, ReferenceableField[]>();
  for (const field of fields) {
    const hits = hitsByName.get(field.name);
    if (hits) hits.push(field);
    else hitsByName.set(field.name, [field]);
  }

  const byName = new Map<string, ReferenceableField | 'ambiguous'>();
  for (const [name, hits] of hitsByName) {
    const own = hits.filter(field => field.path === '');
    const candidates = own.length > 0 ? own : hits;
    byName.set(name, candidates.length === 1 ? candidates[0] : 'ambiguous');
  }
  return byName;
}

export function resolveTypedName(index: ReferenceNameIndex, typed: string): ResolvedTypedName {
  return index.get(typed) ?? 'unknown';
}
