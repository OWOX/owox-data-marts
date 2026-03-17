import { TABLE_TRUNCATION_NOTICE_MARKER } from '../../template/constants/table-truncation-notice.constants';
import { rehypeNormalizeTableTruncationNoticeRows } from './rehype-normalize-table-truncation-notice.plugin';

interface TestNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: TestNode[];
}

function getFirstTableBodyRow(tree: TestNode): TestNode {
  return tree.children?.[0]?.children?.[0]?.children?.[0] as TestNode;
}

describe('rehypeNormalizeTableTruncationNoticeRows', () => {
  it('converts a marker row to full-width colspan notice row', () => {
    const noticeText = 'Showing only first 100 rows.';
    const tree: TestNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'table',
          children: [
            {
              type: 'element',
              tagName: 'tbody',
              children: [
                {
                  type: 'element',
                  tagName: 'tr',
                  children: [
                    {
                      type: 'element',
                      tagName: 'td',
                      children: [
                        { type: 'text', value: `${TABLE_TRUNCATION_NOTICE_MARKER}${noticeText}` },
                      ],
                    },
                    {
                      type: 'element',
                      tagName: 'td',
                      children: [{ type: 'text', value: '' }],
                    },
                    {
                      type: 'element',
                      tagName: 'td',
                      children: [{ type: 'text', value: '' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const transform = rehypeNormalizeTableTruncationNoticeRows();
    transform(tree);

    const row = getFirstTableBodyRow(tree);
    expect(row.children).toHaveLength(1);
    expect(row.children?.[0]?.tagName).toBe('td');
    expect(row.children?.[0]?.properties).toEqual({ colspan: '3' });
    expect(row.children?.[0]?.children?.[0]?.tagName).toBe('em');
    expect(row.children?.[0]?.children?.[0]?.children?.[0]?.value).toBe(noticeText);
  });

  it('does not change non-marker rows', () => {
    const tree: TestNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'table',
          children: [
            {
              type: 'element',
              tagName: 'tbody',
              children: [
                {
                  type: 'element',
                  tagName: 'tr',
                  children: [
                    {
                      type: 'element',
                      tagName: 'td',
                      children: [{ type: 'text', value: 'regular value' }],
                    },
                    {
                      type: 'element',
                      tagName: 'td',
                      children: [{ type: 'text', value: 'another value' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const transform = rehypeNormalizeTableTruncationNoticeRows();
    transform(tree);

    const row = getFirstTableBodyRow(tree);
    expect(row.children).toHaveLength(2);
    expect(row.children?.[0]?.children?.[0]?.value).toBe('regular value');
    expect(row.children?.[1]?.children?.[0]?.value).toBe('another value');
  });

  it('does not change rows with empty marker payload', () => {
    const tree: TestNode = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'table',
          children: [
            {
              type: 'element',
              tagName: 'tbody',
              children: [
                {
                  type: 'element',
                  tagName: 'tr',
                  children: [
                    {
                      type: 'element',
                      tagName: 'td',
                      children: [{ type: 'text', value: `${TABLE_TRUNCATION_NOTICE_MARKER}   ` }],
                    },
                    {
                      type: 'element',
                      tagName: 'td',
                      children: [{ type: 'text', value: '' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const transform = rehypeNormalizeTableTruncationNoticeRows();
    transform(tree);

    const row = getFirstTableBodyRow(tree);
    expect(row.children).toHaveLength(2);
    expect(row.children?.[0]?.children?.[0]?.value).toBe(`${TABLE_TRUNCATION_NOTICE_MARKER}   `);
  });
});
