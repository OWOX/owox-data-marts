import { describe, expect, it } from 'vitest';
import type { ModelGraph } from '../model-graph';
import { serializeOkfBundle } from './serialize';

const GRAPH: ModelGraph = {
  storageId: 'BigQuery (Common)',
  nodes: [
    {
      key: 'orders',
      title: 'Orders',
      inputSource: 'SQL',
      description: 'All orders',
      schema: [
        { name: 'order_id', type: 'STRING', pk: true },
        { name: 'customer_id', type: 'STRING', pk: false },
      ],
      position: { x: 0, y: 0 },
      status: 'created',
    },
    {
      key: 'customers',
      title: 'Customers',
      inputSource: 'TABLE',
      schema: [{ name: 'id', type: 'STRING', pk: true, alias: 'Customer ID' }],
      position: { x: 100, y: 0 },
      status: 'pending',
    },
  ],
  edges: [
    {
      id: 'edge-1',
      from: 'orders',
      to: 'customers',
      keys: [{ left: 'customer_id', right: 'id' }],
      bidirectional: true,
    },
  ],
};

describe('serializeOkfBundle', () => {
  it('emits one document per data mart plus an index, under the bundle folder', () => {
    const { files } = serializeOkfBundle(GRAPH, 'BigQuery (Common)');
    expect(Object.keys(files).sort()).toEqual([
      'bigquery-common/customers.md',
      'bigquery-common/index.md',
      'bigquery-common/orders.md',
    ]);
  });

  it('renders joins as links whose slugs match the target filenames', () => {
    const { files } = serializeOkfBundle(GRAPH);
    expect(files['data-marts/orders.md']).toContain(
      '- [Customers](./customers.md) — `customer_id = id`'
    );
    // Bidirectional edge: the reverse side flips the join condition.
    expect(files['data-marts/customers.md']).toContain(
      '- [Orders](./orders.md) — `id = customer_id`'
    );
  });

  it('annotates FK columns and keeps the alias column only when aliases exist', () => {
    const { files } = serializeOkfBundle(GRAPH);
    expect(files['data-marts/orders.md']).toContain('| Column | Type | Description |');
    expect(files['data-marts/orders.md']).toContain('FK to [Customers](./customers.md)');
    expect(files['data-marts/customers.md']).toContain('| Column | Type | Alias | Description |');
    expect(files['data-marts/customers.md']).toContain('Customer ID');
  });

  it('renders the index table with statuses resolved and the product footer', () => {
    const { files } = serializeOkfBundle(GRAPH, 'My Storage');
    const index = files['my-storage/index.md'];
    expect(index).toContain('| [Orders](./orders.md) | SQL | BigQuery (Common) |');
    expect(index).toContain('Generated with [OWOX Data Marts]');
    expect(files['my-storage/orders.md']).toContain('- **Status:** PUBLISHED');
    expect(files['my-storage/customers.md']).toContain('- **Status:** DRAFT');
  });

  it('emits no data mart identifiers, matching the sanitized JSON export', () => {
    const { files } = serializeOkfBundle(GRAPH);
    expect(files['data-marts/orders.md']).not.toContain('**ID:**');
    expect(files['data-marts/orders.md']).not.toContain('id-orders');
  });

  it('escapes pipes so titles and aliases cannot break the tables', () => {
    const { files } = serializeOkfBundle({
      ...GRAPH,
      nodes: GRAPH.nodes.map(node =>
        node.key === 'customers'
          ? {
              ...node,
              title: 'Customers | VIP',
              schema: [{ name: 'id', type: 'STRING', pk: true, alias: 'Customer | ID' }],
            }
          : node
      ),
    });
    expect(files['data-marts/index.md']).toContain('[Customers \\| VIP]');
    expect(files['data-marts/customers-vip.md']).toContain('Customer \\| ID');
  });

  it('renders a Definition section with the table path or SQL text when present', () => {
    const { files } = serializeOkfBundle({
      ...GRAPH,
      nodes: GRAPH.nodes.map(node =>
        node.key === 'orders'
          ? { ...node, definition: 'SELECT id, revenue FROM raw.orders' }
          : { ...node, definition: 'project.dataset.customers' }
      ),
    });
    expect(files['data-marts/orders.md']).toContain(
      '## Definition\n\n```sql\nSELECT id, revenue FROM raw.orders\n```'
    );
    expect(files['data-marts/customers.md']).toContain(
      '## Definition\n\n```text\nproject.dataset.customers\n```'
    );
    // Without a definition the section is omitted entirely.
    const { files: bare } = serializeOkfBundle(GRAPH);
    expect(bare['data-marts/orders.md']).not.toContain('## Definition');
  });

  it('keeps a backtick-fence line inside a SQL definition from closing the block', () => {
    const sql = 'SELECT 1\n/*\n```\nsample fence in a comment\n*/\nFROM raw.orders';
    const { files } = serializeOkfBundle({
      ...GRAPH,
      nodes: GRAPH.nodes.map(node =>
        node.key === 'orders' ? { ...node, inputSource: 'SQL' as const, definition: sql } : node
      ),
    });
    const doc = files['data-marts/orders.md'];
    // The inner fence line is padded with a space, so it can no longer close the block...
    expect(doc).toContain('\n ```\nsample fence in a comment');
    // ...and the Model Canvas parser regex extracts the WHOLE definition (round-trip).
    const parsed = /^##?\s+Definition\s*\n+```[^\n]*\n([\s\S]*?)\n```/im.exec(doc);
    expect(parsed?.[1]).toContain('FROM raw.orders');
  });

  it('escapes square brackets so titles cannot terminate their links early', () => {
    const { files } = serializeOkfBundle({
      ...GRAPH,
      nodes: GRAPH.nodes.map(node =>
        node.key === 'customers' ? { ...node, title: 'Customers [EU]' } : node
      ),
    });
    expect(files['data-marts/index.md']).toContain('[Customers \\[EU\\]](./customers-eu.md)');
    expect(files['data-marts/orders.md']).toContain(
      '- [Customers \\[EU\\]](./customers-eu.md) — `customer_id = id`'
    );
  });
});
