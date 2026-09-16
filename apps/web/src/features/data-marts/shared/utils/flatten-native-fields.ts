import type { NativeField } from '../types/relationship.types';
import {
  effectiveComparisonType,
  isArrayFieldType,
} from '../../edit/components/ReportColumnPicker/output-controls-operators';

// Mirrors the backend collectSchemaFieldPaths walker: hidden and disconnected nodes (with their
// subtrees) are unavailable for reporting and surface in the Disconnected columns block instead.
export function flattenNativeFields(fields: readonly NativeField[], prefix = ''): NativeField[] {
  const result: NativeField[] = [];
  for (const field of fields) {
    // A calculated field is never sourced from the warehouse, so its warehouse-derived status must
    // not hide it. `isHiddenForReporting` still applies — that is a governance choice.
    if (field.isHiddenForReporting) continue;
    if (!field.calculated && field.status === 'DISCONNECTED') continue;
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    const reportType = field.type ? effectiveComparisonType(field.type, field.mode) : field.type;
    result.push({
      name: fullName,
      // A REPEATED field's element type is not its comparison type — ARRAY<T> is what the operator
      // menus must match against the backend validator.
      type: reportType,
      alias: field.alias,
      description: field.description,
      isPrimaryKey: field.isPrimaryKey,
      aggregationRole: field.aggregationRole,
      allowedAggregations: field.allowedAggregations,
      calculated: field.calculated,
    });
    if (!isArrayFieldType(reportType) && field.fields && Array.isArray(field.fields)) {
      result.push(...flattenNativeFields(field.fields, fullName));
    }
  }
  return result;
}
