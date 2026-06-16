import { BlendableSchemaDto } from '../dto/domain/blendable-schema.dto';
import { BlendedFieldEntry } from '../data-storage-types/interfaces/blended-query-builder.interface';
import { aliasPathToCteName } from '../dto/schemas/filter-config.schema';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

/**
 * Builds the flat resolution index from a blendable schema. Excluded sources'
 * fields are indexed with `isIncluded: false` so the validator can tell
 * "excluded" apart from "unknown". Hidden fields are omitted (cannot be sliced),
 * matching the post-join `homeFieldTypes` map.
 */
export function buildBlendedFieldIndex(
  schema: Pick<BlendableSchemaDto, 'blendedFields' | 'availableSources'>
): Map<string, BlendedFieldEntry> {
  const excluded = new Set<string>();
  for (const source of schema.availableSources) {
    if (source.isIncluded === false) excluded.add(source.aliasPath);
  }

  const index = new Map<string, BlendedFieldEntry>();
  for (const field of schema.blendedFields) {
    if (field.isHidden) continue;
    // The `__` separator can appear inside an alias segment or a field name, so
    // two distinct (aliasPath, originalFieldName) pairs can fold to the same
    // unified name. Last-write-wins would silently resolve a slice to the wrong
    // column/CTE — surface it as a user-fixable error instead, mirroring
    // assertNoChainCollisions.
    const existing = index.get(field.name);
    if (existing) {
      throw new BusinessViolationException(
        `Ambiguous blended column name "${field.name}": it maps to both ` +
          `aliasPath="${existing.aliasPath}" field="${existing.originalFieldName}" and ` +
          `aliasPath="${field.aliasPath}" field="${field.originalFieldName}". ` +
          `Rename one of the conflicting aliases or fields so each blended column has a unique name.`,
        {
          unifiedName: field.name,
          conflicts: [
            { aliasPath: existing.aliasPath, originalFieldName: existing.originalFieldName },
            { aliasPath: field.aliasPath, originalFieldName: field.originalFieldName },
          ],
        }
      );
    }
    index.set(field.name, {
      aliasPath: field.aliasPath,
      cteName: aliasPathToCteName(field.aliasPath),
      originalFieldName: field.originalFieldName,
      type: field.type,
      isIncluded: !excluded.has(field.aliasPath),
    });
  }
  return index;
}
