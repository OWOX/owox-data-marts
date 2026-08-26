import { BlendableSchemaDto } from '../../dto/domain/blendable-schema.dto';
import { collectSchemaFieldPaths } from '../../data-storage-types/data-mart-schema.utils';
import { calculatedFieldsOf } from '../../calculated-fields/calculated-field.utils';

export interface ReportingColumns {
  /** Every reporting-visible native field name, INCLUDING a calculated field — the existence
   * authority `HttpDataColumnValidator` binds an explicitly named column against. A calculated
   * metric is a real, selectable field; it must read as "known" the moment it is asked for by
   * name, same as any other column. */
  native: string[];
  /** `native` minus any calculated field — what an implicit-all / wildcard selection (`columns`
   * omitted, `columns=*`, `columns=**`) actually resolves to. Decision 10: a calculated
   * metric is composed only when asked for by name, so adding one to the schema must not change
   * what an existing wildcard caller receives. */
  implicitAllNative: string[];
  /** Every reporting-visible BLENDED field name, INCLUDING a joined Data Mart's calculated field
   * — the existence authority an explicitly named blended column binds against, so naming one
   * earns the refusal that says why it cannot be projected instead of a bare "Unknown column". */
  blended: string[];
  /** `blended` minus any calculated field of a joined Data Mart — the blended half of what a
   * wildcard (`columns=**`) resolves to. Decision 10 again, across the join: such a field cannot
   * be projected at all, so sweeping it in would turn an existing, unchanged wildcard request
   * into a 400 the day someone adds a formula to a Data Mart it merely joins. */
  implicitAllBlended: string[];
}

export function nativeColumnNames(schema: BlendableSchemaDto): string[] {
  return collectSchemaFieldPaths(schema.nativeFields);
}

export function implicitAllNativeColumnNames(schema: BlendableSchemaDto): string[] {
  const calculatedNames = new Set(calculatedFieldsOf(schema.nativeFields).map(f => f.name));
  return nativeColumnNames(schema).filter(name => !calculatedNames.has(name));
}

// Must stay in sync with the web ReportColumnPicker visibility predicate.
export function visibleBlendedColumnNames(schema: BlendableSchemaDto): string[] {
  const includedPaths = new Set(
    schema.availableSources
      .filter(source => source.isIncluded && source.isAccessibleForReporting)
      .map(source => source.aliasPath)
  );
  return schema.blendedFields
    .filter(field => includedPaths.has(field.aliasPath) && !field.isHidden)
    .map(field => field.name);
}

export function implicitAllBlendedColumnNames(schema: BlendableSchemaDto): string[] {
  const calculatedNames = new Set(
    schema.blendedFields.filter(field => field.isCalculated).map(field => field.name)
  );
  return visibleBlendedColumnNames(schema).filter(name => !calculatedNames.has(name));
}
