/**
 * The fields a calculated-field formula on THIS Data Mart may reference, and the lookup from a
 * typed name back to one of them.
 *
 * Mirrors the backend's `collectFormulaReferenceableFields` in
 * apps/backend/src/data-marts/data-storage-types/data-mart-schema.utils.ts, calculated fields
 * included: since #6732 a formula may read another calculated field of the same Data Mart, so the
 * two traversals now answer the same question with the same list. What this index adds is the
 * referenced field's LEVEL, which decides how it may be written — an aggregate-level one is legal
 * bare and refused inside an aggregation, a row-level one is the reverse.
 *
 * A formula may also reference a JOINED Data Mart's field. Those entries come from the blendable
 * schema rather than from this Data Mart's own schema, and `buildJoinedReferenceIndex` below
 * mirrors the backend's `buildJoinedReferenceIndex` (calculated-field.utils.ts) on which of them
 * resolve — including its three deliberate asymmetries against the own-Data-Mart rules above: a
 * joined field HIDDEN for reporting is refused at save, a source EXCLUDED from reporting is still
 * perfectly referenceable (its join is built either way), and a joined CALCULATED field stays
 * refused where an own one is now allowed (D12, see below).
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
   * level no save has derived yet. Deliberately not resolved here: the two consumers want
   * different things from not knowing. A menu label may take the quiet guess
   * (`isRowLevelCalculatedField`); a hover sentence that rules something out may not.
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
 * A field with no name cannot be named by a formula — and offering one is not merely useless.
 * "Add calculated field" appends a CONNECTED row whose name is typed AFTERWARDS, so the schema
 * editor genuinely holds a nameless field for a while, and an empty name in the index matches the
 * empty string at every boundary in the formula: `resolveAll` returns zero-length references and
 * `toStoredForm` splices a `{{ref field=""}}` into each of them. Whitespace-only for the same
 * reason — a name being typed passes through a lone space, which matches every space in the text.
 *
 * Checked rather than trusted, although `name` is a required field: these types are plain
 * interfaces over a cast API response that nothing validates at runtime, and a `TypeError` raised
 * from the `useMemo` that builds this index would blank the whole schema table. (`typeof` rather
 * than `?.` — `no-unnecessary-condition` rejects an optional chain on a `string`.)
 */
function isNameable(field: SchemaField): boolean {
  return typeof field.name === 'string' && field.name.trim() !== '';
}

/**
 * Every field a formula on THIS Data Mart may reference.
 *
 * Hidden fields ARE offered: `isHiddenForReporting` takes a column off the reporting menu, it
 * does not remove it from the source, and computing is not projecting. Calculated fields ARE
 * offered since #6732, carrying their level — withholding it would invite the very formula the
 * save then refuses, since the level is what decides whether the field is legal bare or has to be
 * wrapped in an aggregation. Disconnected fields are NOT offered: they are genuinely gone from the
 * warehouse, and so is their whole subtree.
 *
 * A field's own name is offered to its own formula too. That reads like an invitation to a
 * self-reference, and is deliberate: the backend answers one with "`roas` references itself, so it
 * has no value to compute", which it can only do for a name it RESOLVED — filter it out here and
 * the same formula comes back as a bare unknown word instead.
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
 * That name is built from the STRUCTURAL alias path, never from the source's display name: each
 * aliasPath segment is a join alias validated against `^[a-z0-9_]+$` (ALIAS_SEGMENT_REGEX), while
 * a display name is free-form user text that may hold spaces and would not be typeable as SQL.
 *
 * Hidden fields are NOT offered — the opposite of the own-Data-Mart rule above, and deliberately
 * so: `CalculatedFieldValidatorService` refuses a joined reference to a hidden field
 * (`joinedFieldHidden`), so offering one would suggest a formula the save is guaranteed to reject.
 */
/**
 * Both candidates are free-form user text stored exactly as typed (neither the join form nor the
 * schema trims), so a whitespace-only one falls through to the next rather than labelling the
 * field with padding — the same discipline as the backend's `formatBlendedFieldDisplayName`.
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
    // NOT the own-Data-Mart rule above, and the difference is deliberate: #6732 lifted the refusal
    // for the metric's OWN mart only (D12). A JOINED formula is still answered with
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
 * Built ONCE per resolution pass rather than scanned per name: the editor re-resolves on every
 * keystroke, and since this index also carries every joined source's fields, a wide join tree can
 * reach four figures of entries — a per-name linear scan of that is quadratic work per character
 * typed, on exactly the blended Data Marts this feature is for.
 *
 * Precedence is decided here, once per name, so there is a single place that knows the rule:
 * OWN-Data-Mart fields win. A BigQuery RECORD `orders` with a subfield `amount` and a Data Mart
 * joined under the alias `orders` both produce the typed name `orders.amount`, and the metric's own
 * Data Mart takes it. Only a collision WITHIN the winning group is ambiguous — two joined
 * candidates can still collide (source `orders` with field `items.qty` against source
 * `orders.items` with field `qty`), and neither is guessed.
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
