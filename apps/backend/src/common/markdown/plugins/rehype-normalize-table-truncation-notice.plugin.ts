import { TABLE_TRUNCATION_NOTICE_MARKER } from '../../template/constants/table-truncation-notice.constants';

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function isElement(node: HastNode, tagName?: string): boolean {
  if (node.type !== 'element') {
    return false;
  }
  if (!tagName) {
    return true;
  }
  return node.tagName === tagName;
}

function walkTree(node: HastNode, visitor: (node: HastNode) => void): void {
  visitor(node);
  for (const child of node.children ?? []) {
    walkTree(child, visitor);
  }
}

function extractText(node: HastNode): string {
  if (node.type === 'text') {
    return node.value ?? '';
  }

  return (node.children ?? []).map(child => extractText(child)).join('');
}

/**
 * Converts a service truncation marker row in markdown table HTML
 * into a single full-width <td colspan="N"><em>...</em></td> row.
 */
export function rehypeNormalizeTableTruncationNoticeRows() {
  return (tree: unknown) => {
    walkTree(tree as HastNode, node => {
      if (!isElement(node, 'tr')) {
        return;
      }

      const cells = (node.children ?? []).filter(child => isElement(child, 'td'));
      if (cells.length < 2) {
        return;
      }

      const firstCellText = extractText(cells[0]);
      if (!firstCellText.startsWith(TABLE_TRUNCATION_NOTICE_MARKER)) {
        return;
      }

      const noticeText = firstCellText.slice(TABLE_TRUNCATION_NOTICE_MARKER.length).trim();
      if (!noticeText) {
        return;
      }

      const noticeCell = cells[0];
      noticeCell.properties = {
        ...(noticeCell.properties ?? {}),
        colspan: String(cells.length),
      };
      noticeCell.children = [
        {
          type: 'element',
          tagName: 'em',
          properties: {},
          children: [{ type: 'text', value: noticeText }],
        },
      ];
      node.children = [noticeCell];
    });
  };
}
