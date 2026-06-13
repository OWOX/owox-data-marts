import { buildDocument, docHash } from './document-builder';
import type { SearchableDataMart } from '../catalog/data-mart-catalog.port';

function mart(overrides: Partial<SearchableDataMart> = {}): SearchableDataMart {
  return {
    id: 'mart-1',
    projectId: 'proj-1',
    title: 'Sales Report',
    description: null,
    fieldNames: [],
    contexts: [],
    modifiedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('buildDocument', () => {
  it('returns title only when no other fields are set', () => {
    expect(buildDocument(mart())).toBe('Sales Report');
  });

  it('appends description on a new line', () => {
    const doc = buildDocument(mart({ description: 'Monthly sales breakdown' }));
    expect(doc).toBe('Sales Report\nMonthly sales breakdown');
  });

  it('skips null description', () => {
    const doc = buildDocument(mart({ description: null }));
    expect(doc).toBe('Sales Report');
    expect(doc).not.toContain('\n');
  });

  it('includes context contents in order after description', () => {
    const doc = buildDocument(
      mart({
        description: 'Desc',
        contexts: [
          { name: 'ctx1', content: 'Context one' },
          { name: 'ctx2', content: 'Context two' },
        ],
      })
    );
    expect(doc).toBe('Sales Report\nDesc\nContext one\nContext two');
  });

  it('skips context entries with empty content', () => {
    const doc = buildDocument(
      mart({
        contexts: [
          { name: 'empty', content: '' },
          { name: 'valid', content: 'Useful context' },
        ],
      })
    );
    expect(doc).toBe('Sales Report\nUseful context');
  });

  it('appends fieldNames joined with comma-space as the last line', () => {
    const doc = buildDocument(mart({ fieldNames: ['revenue', 'cost', 'profit'] }));
    expect(doc).toBe('Sales Report\nrevenue, cost, profit');
  });

  it('does not add an empty line when fieldNames array is empty', () => {
    const doc = buildDocument(mart({ fieldNames: [] }));
    expect(doc).toBe('Sales Report');
    expect(doc.endsWith('\n')).toBe(false);
  });

  it('produces full document with all parts in correct order', () => {
    const doc = buildDocument(
      mart({
        title: 'Revenue',
        description: 'Total revenue',
        contexts: [
          { name: 'c1', content: 'Finance context' },
          { name: 'c2', content: 'Sales context' },
        ],
        fieldNames: ['amount', 'currency'],
      })
    );
    expect(doc).toBe('Revenue\nTotal revenue\nFinance context\nSales context\namount, currency');
  });
});

describe('docHash', () => {
  it('returns a 64-character hex string', () => {
    const hash = docHash('model-id', 'some document');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same inputs', () => {
    const doc = 'Revenue\nTotal revenue';
    expect(docHash('model-a', doc)).toBe(docHash('model-a', doc));
  });

  it('differs for same document with different modelId', () => {
    const doc = 'Revenue\nTotal revenue';
    expect(docHash('model-a', doc)).not.toBe(docHash('model-b', doc));
  });

  it('differs for same modelId with different document', () => {
    expect(docHash('model-a', 'doc one')).not.toBe(docHash('model-a', 'doc two'));
  });

  it('differs between modelId prefix and doc suffix ambiguity', () => {
    expect(docHash('model\0doc', '')).not.toBe(docHash('model', '\0doc'));
  });
});
