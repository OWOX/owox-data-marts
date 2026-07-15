import { describe, expect, it } from 'vitest';
import { getRunSummaryParts } from './utils';
import { DataMartRunType } from '../../../shared';
import type { DataMartRunItem } from '../../model';

describe('getRunSummaryParts', () => {
  it('labels HTTP_DATA runs as "HTTP Data" with no report title', () => {
    const run = {
      type: DataMartRunType.HTTP_DATA,
      triggerType: 'manual',
    } as unknown as DataMartRunItem;

    const [description, title] = getRunSummaryParts(run, null);

    expect(description).toBe('Manual HTTP Data run');
    expect(title).toBe('');
  });

  it('labels MCP_QUERY runs as "MCP query" with no report title', () => {
    const run = {
      type: DataMartRunType.MCP_QUERY,
      triggerType: 'manual',
    } as unknown as DataMartRunItem;

    const [description, title] = getRunSummaryParts(run, null);

    expect(description).toBe('Manual MCP query run');
    expect(title).toBe('');
  });

  it('labels DATA_QUALITY runs and exposes their lightweight finding summary', () => {
    const run = {
      type: DataMartRunType.DATA_QUALITY,
      triggerType: 'manual',
      qualitySummary: {
        state: 'ISSUES',
        warningFindings: 2,
        errorFindings: 0,
        noticeFindings: 0,
      },
    } as unknown as DataMartRunItem;

    const [description, title] = getRunSummaryParts(run, null);

    expect(description).toBe('Manual data quality run');
    expect(title).toBe('2 warning findings');
  });
});
