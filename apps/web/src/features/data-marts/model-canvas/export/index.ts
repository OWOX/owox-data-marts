import type { Node } from '@xyflow/react';
import type { CanvasRenderEdge } from '../model/graph/merge-bidirectional-edges';
import type { PathPoint } from '../model/graph/path-point';
import type { ModelCanvasNode } from '../model/types';
import { buildExportFileName, downloadBlob } from './download';
import { exportCanvasPng, exportCanvasSvg, resolveCanvasBackground } from './export-image';
import { canvasToModelGraph, sanitizeModelGraph } from './model-graph';
import { serializeOkfBundle } from './okf/serialize';
import { bundleToZip } from './okf/zip';

export type { DataMartCanvasExportFormat } from '../../shared/components/DataMartBulkActions';
import type { DataMartCanvasExportFormat } from '../../shared/components/DataMartBulkActions';

export interface ModelCanvasExportContext {
  /** The `.react-flow__viewport` element — required for image formats. */
  viewport: HTMLElement | null;
  /** Measured React Flow nodes: bounds for image framing, positions for the graph. */
  flowNodes: Node[];
  nodes: ModelCanvasNode[];
  edges: CanvasRenderEdge[];
  storageTitle?: string;
}

export interface ModelCanvasExportHandle {
  exportCanvas: (format: DataMartCanvasExportFormat) => Promise<void>;
}

export async function exportModelCanvas(
  format: DataMartCanvasExportFormat,
  context: ModelCanvasExportContext
): Promise<void> {
  if (context.nodes.length === 0) return;
  const filename = buildExportFileName(context.storageTitle);

  if (format === 'svg' || format === 'png') {
    if (!context.viewport || context.flowNodes.length === 0) {
      throw new Error('Canvas is not ready for image export');
    }
    const background = resolveCanvasBackground(context.viewport);
    const blob =
      format === 'svg'
        ? await exportCanvasSvg(context.viewport, context.flowNodes, background)
        : await exportCanvasPng(context.viewport, context.flowNodes, background);
    downloadBlob(blob, `${filename}.${format}`);
    return;
  }

  const positions = new Map<string, PathPoint>(
    context.flowNodes.map(node => [node.id, { x: node.position.x, y: node.position.y }])
  );
  const graph = canvasToModelGraph({
    nodes: context.nodes,
    edges: context.edges,
    positions,
    storageLabel: context.storageTitle,
  });

  if (format === 'json') {
    const json = JSON.stringify(sanitizeModelGraph(graph), null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), `${filename}.json`);
    return;
  }

  const bundle = serializeOkfBundle(graph, context.storageTitle ?? 'Data Marts');
  const zip = bundleToZip(bundle.files);
  downloadBlob(new Blob([zip.slice()], { type: 'application/zip' }), `${filename}.zip`);
}
