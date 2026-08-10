import type { Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataMartStatus } from '../../shared/enums/data-mart-status.enum';
import type { ModelCanvasNode } from '../model/types';
import { exportModelCanvas } from './index';

const NODE: ModelCanvasNode = {
  id: 'id-orders',
  title: 'Orders',
  status: DataMartStatus.PUBLISHED,
  description: null,
  fieldCount: 0,
  qualitySummary: {
    state: 'NEVER_RUN',
    enabledChecks: 0,
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    notApplicableChecks: 0,
    errorChecks: 0,
    noticeFindings: 0,
    warningFindings: 0,
    errorFindings: 0,
    violationCount: 0,
    highestSeverity: null,
    dataMartRunId: null,
    lastRunAt: null,
  },
  dataLastUpdated: null,
};

const FLOW_NODE = { id: 'id-orders', position: { x: 10, y: 20 } } as Node;

describe('exportModelCanvas readiness', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('declines without downloading before the first layout pass measures nodes', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => void 0);

    const exported = await exportModelCanvas('json', {
      viewport: null,
      flowNodes: [],
      nodes: [NODE],
      edges: [],
      storageTitle: 'Warehouse',
    });

    expect(exported).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it('downloads and reports success once measured nodes exist', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:mock'),
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => void 0);

    const exported = await exportModelCanvas('json', {
      viewport: null,
      flowNodes: [FLOW_NODE],
      nodes: [NODE],
      edges: [],
      storageTitle: 'Warehouse',
    });

    expect(exported).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it('declines image formats until the viewport element is available', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => void 0);

    const exported = await exportModelCanvas('svg', {
      viewport: null,
      flowNodes: [FLOW_NODE],
      nodes: [NODE],
      edges: [],
      storageTitle: 'Warehouse',
    });

    expect(exported).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
});
