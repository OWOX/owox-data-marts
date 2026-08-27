/**
 * A `{{ref}}` tag's path/field back into the dotted name the analyst typed — a pure formatter,
 * never a lookup. Both halves of the authored name are the STRUCTURAL identifiers the tag already
 * carries: an own-Data-Mart reference's `field` is its dotted schema path, and a joined one is
 * offered as `<aliasPath>.<field>`, which is exactly what this rebuilds
 * (`buildJoinedReferenceIndex` in formula-reference-index.ts).
 *
 * Keeping it a formatter is what makes it safe on a reference the current schema can no longer
 * resolve — a disconnected field, a renamed join alias: it renders the tag's own text rather than
 * failing to find it, and the backend then names precisely what broke.
 */
export function refDisplayName(ref: { path: string; field: string }): string {
  return ref.path ? `${ref.path}.${ref.field}` : ref.field;
}
