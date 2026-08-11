/**
 * The raw U+241F unit separator, embedded literally so every dialect sees the SAME byte — a SQL
 * backslash escape would mean U+241F on BigQuery/Databricks but six characters elsewhere.
 */
export const PK_TUPLE_SEPARATOR = '␟';

/**
 * How a warehouse spells "join these text expressions end to end". Every part is already a
 * finished expression — including the separator literal — so a dialect whose CONCAT is binary-only
 * can chain them with an operator instead.
 */
export type TextConcat = (parts: readonly string[]) => string;

/** The default: one N-ary `CONCAT(...)`. Redshift's CONCAT takes exactly two arguments. */
export const naryTextConcat: TextConcat = parts => `CONCAT(${parts.join(', ')})`;

function assertNonEmpty(refs: readonly string[], fn: string): void {
  if (refs.length === 0) {
    throw new Error(`${fn}: a primary key must have at least one column`);
  }
}

/**
 * One scalar string standing for a whole key tuple: `CAST(a AS T)` for a single column,
 * `CONCAT(CAST(LENGTH(CAST(a AS T)) AS T), '␟', CAST(a AS T), …)` for several.
 *
 * Each component is LENGTH-PREFIXED (a netstring) rather than merely separated, because a
 * separator alone is forgeable: `('x␟y', 'z')` and `('x', 'y␟z')` both concatenate to `x␟y␟z`, so
 * two distinct key tuples counted as one. With the prefix, decoding is unambiguous — read digits
 * up to the separator, take exactly that many characters, repeat — so no component value can
 * imitate a boundary. `LENGTH` is spelled identically on all five supported warehouses and counts
 * characters on each, which is the same unit the concatenation appends in.
 */
export function renderPrimaryKeyTuple(
  refs: readonly string[],
  castType: string,
  concat: TextConcat = naryTextConcat
): string {
  assertNonEmpty(refs, 'renderPrimaryKeyTuple');
  const parts = refs.map(ref => `CAST(${ref} AS ${castType})`);
  if (parts.length === 1) return parts[0];
  // The separator is handed over as a PART, not as a join string: `CONCAT(...)` and an operator
  // chain agree on the operand list but not on how it is punctuated.
  const interleaved = parts.flatMap(part => [
    `CAST(LENGTH(${part}) AS ${castType})`,
    `'${PK_TUPLE_SEPARATOR}'`,
    part,
  ]);
  return concat(interleaved);
}

function nullTest(refs: readonly string[]): string {
  return refs.map(ref => `${ref} IS NULL`).join(' OR ');
}

/**
 * The composite-key NULL guard, factored out from tuple-building so a dialect that cannot use
 * `renderPrimaryKeyTuple`'s CONCAT (Redshift's is strictly binary) still shares the SAME null-check
 * condition and CASE shape instead of hand-copying it — `refs` decides ONLY whether a component is
 * NULL, `tupleSql` is whatever already-built tuple expression the caller wants guarded. Callers with
 * a single-column key should skip this entirely and pass the bare ref through (see
 * `renderPrimaryKeyCountRef`) — the engine already skips a NULL there on its own.
 */
export function wrapPrimaryKeyNullGuard(refs: readonly string[], tupleSql: string): string {
  assertNonEmpty(refs, 'wrapPrimaryKeyNullGuard');
  return `CASE WHEN ${nullTest(refs)} THEN NULL ELSE ${tupleSql} END`;
}

/**
 * The argument of the MAIN Data Mart's flat `COUNT(DISTINCT …)`, which has no CTE to hide a dedup
 * subquery in and so must reduce a whole key tuple to one scalar. A single-column key is passed
 * through untouched — the engine already skips NULLs there, keeping legacy SQL byte-identical and
 * the count byte-exact. A composite key yields NULL when ANY component is NULL, so the engine skips
 * it the same way; without the guard, `COALESCE(x, '')` would make a NULL component
 * indistinguishable from an empty string.
 *
 * A sleeve controls its own shape and must NOT use this: see `renderPrimaryKeyCountedSlotRef`,
 * which counts per-column slots and therefore casts nothing.
 */
export function renderPrimaryKeyCountRef(
  refs: readonly string[],
  castType: string,
  concat: TextConcat = naryTextConcat
): string {
  assertNonEmpty(refs, 'renderPrimaryKeyCountRef');
  if (refs.length === 1) return refs[0];
  return wrapPrimaryKeyNullGuard(refs, renderPrimaryKeyTuple(refs, castType, concat));
}

/**
 * The argument of a counting sleeve's OUTER `COUNT(...)`, given the aliases its inner
 * `SELECT DISTINCT` projected the key's columns under — one slot per column, so nothing had to be
 * cast to text and concatenated into a single scalar the way `COUNT(DISTINCT …)` demands.
 *
 * The counted rule is the same one `renderPrimaryKeyCountRef` states: a single slot is counted
 * directly (the engine skips NULL there), and a composite key yields NULL as soon as ANY component
 * is NULL — such a row is deduped like any other but is not an identity, so it is not counted.
 */
export function renderPrimaryKeyCountedSlotRef(slotRefs: readonly string[]): string {
  assertNonEmpty(slotRefs, 'renderPrimaryKeyCountedSlotRef');
  if (slotRefs.length === 1) return slotRefs[0];
  return wrapPrimaryKeyNullGuard(slotRefs, '1');
}

/** The slots a value sleeve projects to identify one row of a keyed joined source. */
export interface PrimaryKeyIdentitySlots {
  /** The per-row surrogate, but only for rows the declared key cannot identify. */
  surrogate: string;
  /** The declared key, one slot per column — never cast, never concatenated. */
  keyParts: string[];
}

/**
 * The row identity for the value sleeve's `SELECT DISTINCT` tuple, as SEPARATE SLOTS.
 *
 * A tuple can hold several columns, so the identity does not have to be squeezed into one string:
 * the key's columns ride as they are. That removes both failure modes of a single concatenated
 * slot — a separator a key value can forge, and a text cast that drops digits off a TIMESTAMP or
 * DECIMAL and merges two distinct rows.
 *
 * A declared key with a NULL component is not an identity: those rows take the per-row surrogate
 * instead of collapsing together. The two legs cannot be confused because the surrogate slot is
 * NULL exactly when the key identifies the row — no 'R'/'K' namespace prefix needed. The key slots
 * stay bare: a fallback row is already unique through its surrogate, whatever its partial key holds.
 */
export function renderPrimaryKeyIdentitySlots(
  refs: readonly string[],
  surrogateRef: string
): PrimaryKeyIdentitySlots {
  assertNonEmpty(refs, 'renderPrimaryKeyIdentitySlots');
  return {
    surrogate: `CASE WHEN ${nullTest(refs)} THEN ${surrogateRef} ELSE NULL END`,
    keyParts: [...refs],
  };
}
