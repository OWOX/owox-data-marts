export interface BlendedFieldDisplayNameSource {
  name: string;
  outputPrefix?: string;
  alias?: string;
  originalFieldName?: string;
}

/**
 * Where the joined Data Mart name sits relative to the field name.
 *
 * - `prefix` — `Data Mart name Field name`. The default, used by every surface that renders a
 *   joined field with room to breathe: Looker Studio, email-based destinations, the HTTP data
 *   endpoint and MCP field metadata.
 * - `suffix` — `Field name (Data Mart name)`. Used where the label lands in a narrow spreadsheet
 *   cell and the Data Mart name would push the field name out of view.
 *
 * Which destinations pick which style is decided by `usesSuffixedJoinedFieldNames` in
 * `data-destination-types/enums/data-destination-type.enum.ts`, not here.
 */
export type BlendedFieldNameStyle = 'prefix' | 'suffix';

/**
 * The user-facing label of a blended field, shared by report headers and MCP field metadata.
 *
 * The Data Mart part is attached UNCONDITIONALLY whenever it resolves to a non-blank string —
 * deliberately not "only when the field name is ambiguous within the report". A uniqueness-driven
 * label was considered and rejected: it makes a column's header depend on which other columns
 * happen to be selected, so adding an unrelated field silently renames an existing one.
 *
 * A blank (empty or whitespace-only) `outputPrefix` yields the bare field name — never
 * `Field name ()`.
 */
export function formatBlendedFieldDisplayName(
  field: BlendedFieldDisplayNameSource,
  style: BlendedFieldNameStyle = 'prefix'
): string {
  const fieldName = field.alias || field.originalFieldName || field.name;
  const dataMartName = field.outputPrefix?.trim();

  if (!dataMartName) return fieldName;

  return style === 'suffix' ? `${fieldName} (${dataMartName})` : `${dataMartName} ${fieldName}`;
}
