import { SearchableEntityType } from '../../../common/search/search.facade';
import { DATA_MART_SCORING_CONFIG, type ScoringConfig } from '../engine/scoring-config';
import { computeExtendability } from '../engine/scoring';
import type {
  AtomicTokenSlot,
  EntityScoringDescriptor,
  RichTextSlot,
} from '../indexing/entity-scoring-descriptor';
import { buildDataMartEmbeddingText } from '../indexing/document-builder';
import type { RelationshipEdge, SearchableDataMart } from './data-mart-catalog.port';

function outboundFieldCount(
  mart: SearchableDataMart,
  outboundEdgesBySourceId: Map<string, RelationshipEdge[]>,
  martsById: Map<string, SearchableDataMart>
): number {
  let count = mart.fieldNames.length;
  for (const edge of outboundEdgesBySourceId.get(mart.id) ?? []) {
    const target = martsById.get(edge.targetDataMartId);
    if (target) count += target.fieldNames.length;
  }
  return count;
}

export function buildDataMartScoringDescriptor(
  mart: SearchableDataMart,
  outboundEdgesBySourceId: Map<string, RelationshipEdge[]>,
  martsById: Map<string, SearchableDataMart>,
  config: ScoringConfig = DATA_MART_SCORING_CONFIG
): EntityScoringDescriptor {
  const richTextSlots: RichTextSlot[] = [{ kind: 'title', text: mart.title }];
  if (mart.description) {
    richTextSlots.push({ kind: 'description', text: mart.description });
  }

  const atomicTokenSlots: AtomicTokenSlot[] = mart.fieldNames.map(name => ({
    kind: 'field',
    text: name,
  }));

  const fieldCount = outboundFieldCount(mart, outboundEdgesBySourceId, martsById);

  return {
    entityType: SearchableEntityType.DATA_MART,
    entityId: mart.id,
    projectId: mart.projectId,
    title: mart.title,
    description: mart.description,
    richTextSlots,
    atomicTokenSlots,
    fieldCount,
    extendability: computeExtendability(fieldCount, config),
    modifiedAt: mart.modifiedAt,
    embeddingText: buildDataMartEmbeddingText(mart),
    isDraft: mart.isDraft,
  };
}
