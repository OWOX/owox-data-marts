import { BlendableSchemaDto } from '../../dto/domain/blendable-schema.dto';
import { DataMartSchemaFieldStatus } from '../../data-storage-types/enums/data-mart-schema-field-status.enum';

export interface ReportingColumns {
  native: string[];
  blended: string[];
}

interface NativeSchemaField {
  name: string;
  status?: string;
  isHiddenForReporting?: boolean;
  fields?: NativeSchemaField[];
}

export function nativeColumnNames(schema: BlendableSchemaDto): string[] {
  return collectNative(schema.nativeFields as unknown as NativeSchemaField[]);
}

function collectNative(fields: NativeSchemaField[], prefix = ''): string[] {
  const result: string[] = [];
  for (const field of fields) {
    if (field.isHiddenForReporting) continue;
    if (field.status === DataMartSchemaFieldStatus.DISCONNECTED) continue;
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    result.push(fullName);
    if (field.fields && field.fields.length > 0) {
      result.push(...collectNative(field.fields, fullName));
    }
  }
  return result;
}

// Must stay in sync with the web ReportColumnPicker visibility predicate.
export function visibleBlendedColumnNames(schema: BlendableSchemaDto): string[] {
  const includedPaths = new Set(
    schema.availableSources.filter(source => source.isIncluded).map(source => source.aliasPath)
  );
  return schema.blendedFields
    .filter(field => includedPaths.has(field.aliasPath) && !field.isHidden)
    .map(field => field.name);
}
