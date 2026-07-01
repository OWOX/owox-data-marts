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
});
