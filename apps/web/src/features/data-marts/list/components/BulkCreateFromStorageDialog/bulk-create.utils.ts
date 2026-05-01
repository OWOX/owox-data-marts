import type { StorageResourceLeafDto } from '../../../../data-storage/shared/api/types';
import { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum';
import type {
  UpdateDataMartTableDefinitionRequestDto,
  UpdateDataMartTablePatternDefinitionRequestDto,
  UpdateDataMartViewDefinitionRequestDto,
} from '../../../shared/types/api';
import { isPatternFqn, patternFqnToStored } from '../../../shared/utils/table-pattern.utils';

export type BulkDefinitionRequest =
  | UpdateDataMartTableDefinitionRequestDto
  | UpdateDataMartViewDefinitionRequestDto
  | UpdateDataMartTablePatternDefinitionRequestDto;

/**
 * Derive the definition payload for a freshly-created data mart from a picked storage leaf.
 *
 * Rules:
 *   • VIEW leaf                            → VIEW
 *   • TABLE leaf with `*` in the FQN       → TABLE_PATTERN
 *   • any other TABLE leaf                 → TABLE
 */
export function deriveDefinition(leaf: StorageResourceLeafDto): BulkDefinitionRequest {
  if (leaf.type === 'VIEW') {
    return {
      definitionType: DataMartDefinitionType.VIEW,
      definition: { fullyQualifiedName: leaf.fullyQualifiedName },
    };
  }
  if (isPatternFqn(leaf.fullyQualifiedName)) {
    return {
      definitionType: DataMartDefinitionType.TABLE_PATTERN,
      definition: { pattern: patternFqnToStored(leaf.fullyQualifiedName) },
    };
  }
  return {
    definitionType: DataMartDefinitionType.TABLE,
    definition: { fullyQualifiedName: leaf.fullyQualifiedName },
  };
}

/** Title used for a data mart spawned from a resource leaf. */
export function extractDataMartTitle(leaf: StorageResourceLeafDto): string {
  if (leaf.id && leaf.id.trim().length > 0) return leaf.id;
  const segments = leaf.fullyQualifiedName.split('.');
  return segments[segments.length - 1] || leaf.fullyQualifiedName;
}
