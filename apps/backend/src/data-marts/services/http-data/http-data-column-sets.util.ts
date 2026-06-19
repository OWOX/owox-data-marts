import { BlendableSchemaDto } from '../../dto/domain/blendable-schema.dto';
import { collectSchemaFieldPaths } from '../../data-storage-types/data-mart-schema.utils';

export interface ReportingColumns {
  native: string[];
  blended: string[];
}

export function nativeColumnNames(schema: BlendableSchemaDto): string[] {
  return collectSchemaFieldPaths(schema.nativeFields);
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
