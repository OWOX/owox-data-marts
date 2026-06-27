import type { BlendedField } from '../../../shared/types/relationship.types';
import type { BlendedGroup, NativeField } from './report-column-picker.types';

export interface ColumnSearchResult {
  visibleNativeFields: NativeField[];
  visibleBlendedGroups: BlendedGroup[];
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function containsSearchText(value: string | undefined, normalizedQuery: string): boolean {
  if (!value) return false;
  return value.toLocaleLowerCase().includes(normalizedQuery);
}

function matchesNativeField(field: NativeField, query: string): boolean {
  return containsSearchText(field.alias, query) || containsSearchText(field.name, query);
}

function matchesBlendedField(field: BlendedField, query: string): boolean {
  return (
    containsSearchText(field.alias, query) || containsSearchText(field.originalFieldName, query)
  );
}

function matchesGroup(group: BlendedGroup, query: string): boolean {
  return containsSearchText(group.alias, query) || containsSearchText(group.title, query);
}

/**
 * Builds a searchable view of report columns without mutating
 * the original native fields or blended groups.
 */
export function buildColumnSearchResult(
  nativeFields: NativeField[],
  blendedGroups: BlendedGroup[],
  searchQuery: string
): ColumnSearchResult {
  const normalizedQuery = normalizeSearchText(searchQuery);

  if (!normalizedQuery) {
    return {
      visibleNativeFields: nativeFields,
      visibleBlendedGroups: blendedGroups,
    };
  }

  const visibleNativeFields = nativeFields.filter(field =>
    matchesNativeField(field, normalizedQuery)
  );

  const visibleBlendedGroups = blendedGroups
    .map(group => {
      if (matchesGroup(group, normalizedQuery)) {
        return group;
      }

      const visibleFields = group.visibleFields.filter(field =>
        matchesBlendedField(field, normalizedQuery)
      );

      if (visibleFields.length === 0) {
        return null;
      }
      // Preserve the group, but only include matching fields.
      return {
        ...group,
        visibleFields,
      };
    })
    .filter((group): group is BlendedGroup => group !== null);

  return {
    visibleNativeFields,
    visibleBlendedGroups,
  };
}
