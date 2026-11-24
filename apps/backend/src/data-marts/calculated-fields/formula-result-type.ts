import { categorizeFieldType } from '../dto/schemas/field-type-category';
import type { CalculatedSchemaField } from './calculated-field.utils';
import { FormulaViolations, type FormulaViolation } from './formula-violations';

// These exclusions are BigQuery rules: only the BigQuery dry run returns result types.
const CAST_TARGETS = new Set(['FLOAT', 'NUMERIC', 'BIGNUMERIC']);

// Three declarations stay: number to number, a numeric cast target over STRING, and a result with no category.
function keepsDeclared(declared: string, result: string): boolean {
  const resultCategory = categorizeFieldType(result);
  return (
    resultCategory === 'other' ||
    (resultCategory === 'number' && categorizeFieldType(declared) === 'number') ||
    (resultCategory === 'string' && CAST_TARGETS.has(declared))
  );
}

/** Sets each changed field's type to its formula result type, and returns one warning per change. */
export function applyResultTypes(
  fields: readonly CalculatedSchemaField[],
  resultTypes: ReadonlyMap<string, string> | undefined,
  changed: ReadonlySet<string>
): FormulaViolation[] {
  const warnings: FormulaViolation[] = [];
  for (const field of fields) {
    const result = resultTypes?.get(field.name);
    if (!result || !changed.has(field.name) || field.type === result) continue;
    if (keepsDeclared(field.type, result)) continue;
    warnings.push(FormulaViolations.typeSetFromResult(field.name, field.type, result));
    field.type = result as typeof field.type;
  }
  return warnings;
}
