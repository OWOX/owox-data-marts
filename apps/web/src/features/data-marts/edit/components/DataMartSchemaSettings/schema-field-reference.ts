import { createContext } from 'react';

export interface SchemaFieldNode {
  name: string;
  type?: string;
  fields?: readonly SchemaFieldNode[];
}

interface SchemaFieldReference {
  name: string;
  leafName: string;
  path: string;
  parentPaths: string[];
  navigationKey: string;
}

/** Resolve the exact saved technical name, never an alias or a partial search match. */
export function findSchemaFieldReference(
  fields: readonly SchemaFieldNode[],
  name: string,
  prefix = '',
  parentPaths: string[] = []
): Omit<SchemaFieldReference, 'navigationKey'> | null {
  for (const [index, field] of fields.entries()) {
    const fullName = prefix ? `${prefix}.${field.name}` : field.name;
    const rowPath = parentPaths.length ? `${parentPaths.at(-1)}.${String(index)}` : String(index);
    if (fullName === name) {
      return { name, leafName: field.name, path: rowPath, parentPaths };
    }
    if (field.fields && (field.type === 'RECORD' || field.type === 'STRUCT')) {
      const nested = findSchemaFieldReference(field.fields, name, fullName, [
        ...parentPaths,
        rowPath,
      ]);
      if (nested) return nested;
    }
  }
  return null;
}

export const SchemaFieldReferenceContext = createContext<SchemaFieldReference | null>(null);
