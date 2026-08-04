import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../../shared/enums/data-mart-status.enum';
import type { CanvasRenderEdge } from '../model/graph/merge-bidirectional-edges';
import type { PathPoint } from '../model/graph/path-point';
import type { ModelCanvasNode } from '../model/types';
import { slugify } from './slug';

// The model graph interchange shape used by model.owox.com (Model Canvas).
// Exported JSON must stay compatible with it, so these types mirror that
// project's `ModelGraph` rather than the canvas' own view models.

export type ModelGraphInputSource = 'SQL' | 'CONNECTOR' | 'VIEW' | 'TABLE';
export type ModelGraphNodeStatus = 'pending' | 'created';

export interface ModelGraphSchemaField {
  name: string;
  type: string;
  pk: boolean;
  alias?: string;
}

export interface ModelGraphJoinKey {
  left: string;
  right: string;
}

// No `owoxId` on nodes: data mart identifiers carry no meaning outside this
// project (the LLM/documentation use case reads titles, schemas and joins),
// so no export format emits them.
export interface ModelGraphNode {
  key: string;
  title: string;
  inputSource: ModelGraphInputSource;
  description?: string;
  schema: ModelGraphSchemaField[];
  position: { x: number; y: number };
  status: ModelGraphNodeStatus;
}

export interface ModelGraphEdge {
  id: string;
  from: string;
  to: string;
  keys: ModelGraphJoinKey[];
  bidirectional: boolean;
}

export interface ModelGraph {
  storageId: string | null;
  nodes: ModelGraphNode[];
  edges: ModelGraphEdge[];
}

const INPUT_SOURCE_BY_DEFINITION_TYPE: Record<DataMartDefinitionType, ModelGraphInputSource> = {
  [DataMartDefinitionType.SQL]: 'SQL',
  [DataMartDefinitionType.TABLE]: 'TABLE',
  [DataMartDefinitionType.VIEW]: 'VIEW',
  // Model Canvas has no pattern concept — a pattern still resolves to tables.
  [DataMartDefinitionType.TABLE_PATTERN]: 'TABLE',
  [DataMartDefinitionType.CONNECTOR]: 'CONNECTOR',
};

export interface CanvasModelGraphInput {
  nodes: ModelCanvasNode[];
  edges: CanvasRenderEdge[];
  /** Live canvas positions by data mart id (post-layout / user-dragged). */
  positions: ReadonlyMap<string, PathPoint>;
  /** Human-readable storage label rendered into the OKF documents. */
  storageLabel?: string;
}

/** Build the full model graph; JSON export runs it through {@link sanitizeModelGraph}. */
export function canvasToModelGraph(input: CanvasModelGraphInput): ModelGraph {
  const keyById = new Map<string, string>();
  const taken = new Set<string>();
  for (const node of input.nodes) {
    const base = slugify(node.title, node.id);
    let unique = base;
    let suffix = 2;
    while (taken.has(unique)) unique = `${base}-${String(suffix++)}`;
    taken.add(unique);
    keyById.set(node.id, unique);
  }

  const nodes: ModelGraphNode[] = input.nodes.map(node => ({
    key: keyById.get(node.id) ?? node.id,
    title: node.title,
    inputSource: node.definitionType
      ? INPUT_SOURCE_BY_DEFINITION_TYPE[node.definitionType]
      : 'TABLE',
    description: node.description ?? undefined,
    schema: (node.fields ?? []).map(field => ({
      name: field.name,
      type: field.type,
      pk: field.isPrimaryKey,
      ...(field.alias && field.alias !== field.name ? { alias: field.alias } : {}),
    })),
    position: input.positions.get(node.id) ?? { x: 0, y: 0 },
    status: node.status === DataMartStatus.PUBLISHED ? 'created' : 'pending',
  }));

  const edges: ModelGraphEdge[] = input.edges.flatMap(edge => {
    const from = keyById.get(edge.sourceId);
    const to = keyById.get(edge.targetId);
    if (!from || !to) return [];
    return [
      {
        id: edge.id,
        from,
        to,
        keys: edge.joinConditions.map(condition => ({
          left: condition.sourceFieldName,
          right: condition.targetFieldName,
        })),
        bidirectional: edge.bidirectional,
      },
    ];
  });

  return { storageId: input.storageLabel ?? null, nodes, edges };
}

/** The JSON-file shape: {@link ModelGraph} without the push-flow-only storage field. */
export type SanitizedModelGraph = Omit<ModelGraph, 'storageId'>;

/**
 * Strip everything project-specific before the graph leaves the product as a
 * JSON file — the same rules model.owox.com applies to its share links. The
 * `storageId` field is dropped entirely: it only carries meaning in the Model
 * Canvas push flow, and its import tolerates the field being absent.
 */
export function sanitizeModelGraph(graph: ModelGraph): SanitizedModelGraph {
  return {
    nodes: graph.nodes.map(node => ({
      key: node.key,
      title: node.title,
      inputSource: node.inputSource,
      description: node.description,
      schema: node.schema,
      position: node.position,
      status: 'pending',
    })),
    edges: graph.edges.map(edge => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      keys: edge.keys,
      bidirectional: edge.bidirectional,
    })),
  };
}
