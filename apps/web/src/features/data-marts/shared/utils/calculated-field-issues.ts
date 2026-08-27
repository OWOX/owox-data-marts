import type { CalculatedFieldIssue } from '../types/relationship.types';

/** Anything carrying a calculated field's identity and formula — a schema field, in practice. */
interface FieldWithOptionalFormula {
  name: string;
  calculated?: { formula: string };
}

/**
 * How a broken calculated field is worded wherever it surfaces — the report column
 * picker's row hint and the Data Mart's own output schema. One function so the two surfaces cannot
 * disagree about what the backend's verdict means; each adds its own call to action, which differs
 * (the report's reader has to ask someone, the schema's editor can fix the formula in place).
 */
export function describeMissingReferences(missing: readonly string[]): string | undefined {
  if (missing.length === 0) return undefined;
  // NOT "gone from the Data Mart": a formula may read another calculated field, and the
  // backend's verdict is transitive — so a name here can be a field that is right there in the
  // schema and simply cannot be computed, because its own formula is broken.
  return `This calculated field reads ${missing.map(name => `\`${name}\``).join(', ')}, which ${
    missing.length === 1 ? 'is' : 'are'
  } missing from the Data Mart, or broken.`;
}

/**
 * The broken metrics worth showing WHILE the schema is being edited, keyed by field name.
 *
 * `calculatedFieldIssues` is the backend's verdict on the SAVED schema, so it says nothing about a
 * formula that is not saved yet: a metric just added has no entry at all, and one whose formula was
 * just fixed still carries its old entry until the save round-trips. An entry survives here only
 * while the live formula is still the formula that was judged — a metric being worked on is left
 * unmarked rather than marked wrongly, and the backend re-judges it on save.
 */
export function resolveCalculatedFieldIssues(
  issues: readonly CalculatedFieldIssue[] | undefined,
  savedFields: readonly FieldWithOptionalFormula[] | undefined,
  liveFields: readonly FieldWithOptionalFormula[] | undefined
): ReadonlyMap<string, readonly string[]> {
  const resolved = new Map<string, readonly string[]>();
  if (!issues || issues.length === 0) return resolved;

  const saved = formulasByName(savedFields);
  const live = formulasByName(liveFields);
  for (const issue of issues) {
    const judged = saved.get(issue.field);
    if (judged !== undefined && judged === live.get(issue.field)) {
      resolved.set(issue.field, issue.missing);
    }
  }
  return resolved;
}

function formulasByName(fields: readonly FieldWithOptionalFormula[] | undefined) {
  const formulas = new Map<string, string>();
  for (const field of fields ?? []) {
    if (field.calculated) formulas.set(field.name, field.calculated.formula);
  }
  return formulas;
}
