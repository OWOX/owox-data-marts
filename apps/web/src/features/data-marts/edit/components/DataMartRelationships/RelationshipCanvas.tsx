import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { LayoutGrid, Table2 } from 'lucide-react';
import { Button } from '../../../../../shared/components/Button';
import type { DataMartRelationship } from '../../../shared/types/relationship.types';
import { useProjectRoute } from '../../../../../shared/hooks';

interface RelationshipCanvasProps {
  dataMartId: string;
  dataMartTitle: string;
  relationships: DataMartRelationship[];
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;
const FIELD_ROW_HEIGHT = 28;

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction = 'LR'
): { nodes: Node[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, ranksep: 80, nodesep: 40 });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, {
      width: node.width ?? NODE_WIDTH,
      height: node.height ?? NODE_HEIGHT,
    });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map(node => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - (node.width ?? NODE_WIDTH) / 2,
        y: nodeWithPosition.y - (node.height ?? NODE_HEIGHT) / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export function RelationshipCanvas({
  dataMartId,
  dataMartTitle,
  relationships,
}: RelationshipCanvasProps) {
  const { navigate } = useProjectRoute();
  const [showFields, setShowFields] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const buildGraph = useCallback(() => {
    const nodeMap = new Map<string, Node>();
    const edgeList: Edge[] = [];

    const sourceNodeHeight = showFields
      ? NODE_HEIGHT + relationships.length * FIELD_ROW_HEIGHT
      : NODE_HEIGHT;

    nodeMap.set(dataMartId, {
      id: dataMartId,
      type: 'default',
      position: { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: sourceNodeHeight,
      data: {
        label: (
          <div className='flex h-full flex-col'>
            <div className='bg-primary/10 text-primary rounded-t px-3 py-2 text-xs font-semibold'>
              {dataMartTitle}
            </div>
          </div>
        ),
      },
      style: {
        width: NODE_WIDTH,
        height: sourceNodeHeight,
        padding: 0,
        border: '2px solid var(--color-primary)',
        borderRadius: 8,
        background: 'var(--color-background)',
        cursor: 'default',
      },
    });

    relationships.forEach(rel => {
      const targetId = rel.targetDataMart.id;
      const targetTitle = rel.targetDataMart.title;
      const targetNodeHeight = showFields
        ? NODE_HEIGHT + rel.blendedFields.length * FIELD_ROW_HEIGHT
        : NODE_HEIGHT;

      if (!nodeMap.has(targetId)) {
        nodeMap.set(targetId, {
          id: targetId,
          type: 'default',
          position: { x: 0, y: 0 },
          width: NODE_WIDTH,
          height: targetNodeHeight,
          data: {
            label: (
              <div className='flex h-full flex-col'>
                <div className='rounded-t bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300'>
                  {targetTitle}
                </div>
                {showFields && (
                  <div className='flex flex-col'>
                    {rel.blendedFields.map(field => (
                      <div
                        key={field.targetFieldName}
                        className='border-t border-gray-100 px-3 py-1 text-xs text-gray-500 dark:border-gray-700'
                      >
                        {field.outputAlias || field.targetFieldName}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ),
          },
          style: {
            width: NODE_WIDTH,
            height: targetNodeHeight,
            padding: 0,
            border: '1.5px solid var(--color-border)',
            borderRadius: 8,
            background: 'var(--color-background)',
            cursor: 'pointer',
          },
        });
      }

      const joinLabel = rel.joinConditions
        .map(c => `${c.sourceFieldName} = ${c.targetFieldName}`)
        .join(', ');

      edgeList.push({
        id: rel.id,
        source: dataMartId,
        target: targetId,
        label: joinLabel,
        labelStyle: { fontSize: 10 },
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 1.5 },
      });
    });

    const rawNodes = Array.from(nodeMap.values());
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, edgeList);

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [dataMartId, dataMartTitle, relationships, showFields, setNodes, setEdges]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id !== dataMartId) {
        navigate(`/data-marts/${node.id}/overview`);
      }
    },
    [dataMartId, navigate]
  );

  if (relationships.length === 0) {
    return null;
  }

  return (
    <div className='relative rounded-lg border' style={{ height: 320 }}>
      <div className='absolute top-3 right-3 z-10'>
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            setShowFields(prev => !prev);
          }}
        >
          {showFields ? (
            <>
              <LayoutGrid className='mr-1 h-3.5 w-3.5' />
              Blocks only
            </>
          ) : (
            <>
              <Table2 className='mr-1 h-3.5 w-3.5' />
              Show fields
            </>
          )}
        </Button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
