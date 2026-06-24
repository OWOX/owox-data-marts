import {
  buildDataMartEmbeddingText,
  buildDocument,
  docHash,
  embeddingText,
  indexSignature,
  parseDocument,
} from './document-builder';
import type { SearchableDataMart } from '../catalog/data-mart-catalog.port';
import type { EntityScoringDescriptor } from './entity-scoring-descriptor';
import { SearchableEntityType } from '../../../common/search/search.facade';

function mart(overrides: Partial<SearchableDataMart> = {}): SearchableDataMart {
  return {
    id: 'mart-1',
    projectId: 'proj-1',
    title: 'Sales Report',
    description: null,
    fieldNames: [],
    fieldDetails: [],
    isDraft: false,
    modifiedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function descriptor(overrides: Partial<EntityScoringDescriptor> = {}): EntityScoringDescriptor {
  return {
    entityType: SearchableEntityType.DATA_MART,
    entityId: 'mart-1',
    projectId: 'proj-1',
    title: 'Sales Report',
    description: null,
    richTextSlots: [{ kind: 'title', text: 'Sales Report' }],
    atomicTokenSlots: [],
    fieldCount: 0,
    extendability: 0,
    isDraft: false,
    modifiedAt: new Date('2024-01-01'),
    embeddingText: 'Sales Report',
    ...overrides,
  };
}

describe('embeddingText — delegates to descriptor.embeddingText', () => {
  it('returns the embeddingText field verbatim', () => {
    const d = descriptor({ embeddingText: 'Sales Report' });
    expect(embeddingText(d)).toBe('Sales Report');
  });

  it('returns an empty string when embeddingText is empty', () => {
    const d = descriptor({ embeddingText: '' });
    expect(embeddingText(d)).toBe('');
  });

  it('DataMart descriptor embeddingText can use structured semantic schema text', () => {
    const m = mart({
      title: 'Revenue',
      description: 'Total revenue',
      fieldNames: ['amount', 'currency'],
      fieldDetails: [
        { name: 'amount', alias: 'Amount', description: 'Order amount' },
        { name: 'currency', alias: null, description: null },
      ],
    });
    const expected = buildDataMartEmbeddingText(m);
    const d = descriptor({ embeddingText: expected });
    expect(embeddingText(d)).toBe(expected);
  });
});

describe('buildDataMartEmbeddingText', () => {
  it('uses title, data mart description, field names, aliases, and descriptions', () => {
    const doc = buildDataMartEmbeddingText(
      mart({
        title: 'Revenue',
        description: 'Total revenue',
        fieldDetails: [
          { name: 'raw_amount', alias: 'Revenue Amount', description: 'Booked revenue' },
          { name: 'currency', alias: null, description: 'ISO currency code' },
        ],
      })
    );

    expect(doc).toBe(
      [
        'Revenue',
        'Total revenue',
        'Output schema:',
        '- raw_amount / Revenue Amount: Booked revenue',
        '- currency: ISO currency code',
      ].join('\n')
    );
  });

  it('does not include field types in semantic embedding text', () => {
    const doc = buildDataMartEmbeddingText(
      mart({
        title: 'Orders',
        description: 'Order facts',
        fieldDetails: [{ name: 'order_id', alias: null, description: null }],
      })
    );

    expect(doc).toBe(['Orders', 'Order facts', 'Output schema:', '- order_id'].join('\n'));
    expect(doc).not.toContain('STRING');
  });
});

describe('buildDocument + parseDocument round-trip', () => {
  it('round-trips slots and metadata', () => {
    const d = descriptor({
      title: 'Revenue',
      description: 'Total revenue',
      richTextSlots: [
        { kind: 'title', text: 'Revenue' },
        { kind: 'description', text: 'Total revenue' },
        { kind: 'context', text: 'finance' },
        { kind: 'context', text: 'Finance context' },
      ],
      atomicTokenSlots: [{ kind: 'field', text: 'amount' }],
    });
    const parsed = parseDocument(buildDocument(d));
    expect(parsed.richTextSlots).toEqual(d.richTextSlots);
    expect(parsed.atomicTokenSlots).toEqual(d.atomicTokenSlots);
    expect(parsed.title).toBe(d.title);
    expect(parsed.description).toBe(d.description);
  });

  it('preserves embeddingText in the stored document', () => {
    const d = descriptor({
      title: 'Revenue',
      description: null,
      richTextSlots: [{ kind: 'title', text: 'Revenue' }],
      atomicTokenSlots: [],
    });
    const parsed = parseDocument(buildDocument(d));
    expect(parsed.embeddingText).toBe(embeddingText(d));
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

describe('indexSignature — staleness over the full persisted representation', () => {
  it('changes when fieldCount changes even if embeddingText is unchanged', () => {
    const a = descriptor({ fieldCount: 3 });
    const b = descriptor({ fieldCount: 8 });
    expect(embeddingText(a)).toBe(embeddingText(b));
    expect(indexSignature(a)).not.toBe(indexSignature(b));
  });

  it('changes when a slot kind changes even if embeddingText is unchanged', () => {
    const a = descriptor({ richTextSlots: [{ kind: 'context', text: 'Email' }] });
    const b = descriptor({ richTextSlots: [{ kind: 'description', text: 'Email' }] });
    expect(embeddingText(a)).toBe(embeddingText(b));
    expect(indexSignature(a)).not.toBe(indexSignature(b));
  });

  it('is stable for identical descriptors', () => {
    expect(indexSignature(descriptor())).toBe(indexSignature(descriptor()));
  });
});
