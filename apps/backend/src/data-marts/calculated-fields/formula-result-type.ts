import { categorizeFieldType, isIntegerType } from '../dto/schemas/field-type-category';
import type { CalculatedSchemaField } from './calculated-field.utils';
import { FormulaViolations, type FormulaViolation } from './formula-violations';

// Three declarations stay: number to number, a non-integer number over STRING (the cast rule), and a result with no category.
// These are BigQuery rules: only the BigQuery dry run returns result types.
function keepsDeclared(declared: string, result: string): boolean {
  const resultCategory = categorizeFieldType(result);
  return (
    resultCategory === 'other' ||
    (resultCategory === 'number' && categorizeFieldType(declared) === 'number') ||
    (resultCategory === 'string' &&
      categorizeFieldType(declared) === 'number' &&
      !isIntegerType(declared))
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
    // A set limited to the old category's functions would leave no allowed function.
    if (
      categorizeFieldType(field.type) !== categorizeFieldType(result) &&
      field.allowedAggregations?.length
    ) {
      delete field.allowedAggregations;
    }
    field.type = result as typeof field.type;
  }
  return warnings;
}
