import { useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { CollapsibleCardContext } from '../../../../../shared/components/CollapsibleCard/CollapsibleCardContext';
import { findSchemaFieldReference, SchemaFieldReferenceContext } from './schema-field-reference';
import type { SchemaFieldNode } from './schema-field-reference';

export function SchemaFieldReferenceProvider({
  fieldName,
  navigationKey,
  fields,
  children,
}: {
  fieldName?: string | null;
  navigationKey?: string;
  fields: readonly SchemaFieldNode[];
  children: ReactNode;
}) {
  const reference = useMemo(() => {
    const match = fieldName ? findSchemaFieldReference(fields, fieldName) : null;
    return match ? { ...match, navigationKey: navigationKey ?? fieldName ?? '' } : null;
  }, [fields, fieldName, navigationKey]);
  const { revealTemporarily } = useContext(CollapsibleCardContext);
  const key = reference?.navigationKey;

  useEffect(() => {
    if (key === undefined) return;
    return revealTemporarily?.();
  }, [key, revealTemporarily]);

  return (
    <SchemaFieldReferenceContext.Provider value={reference}>
      {children}
    </SchemaFieldReferenceContext.Provider>
  );
}
