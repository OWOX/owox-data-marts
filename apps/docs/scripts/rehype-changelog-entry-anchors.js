// @ts-check

const CHANGELOG_PAGE = /[\\/]docs[\\/]changelog\.md$/;
const RELEASE = /^\d+\.\d+\.\d+$/;
const COMMIT_PREFIX = /^[0-9a-f]{7,40}: $/;
const BLOCK_TAGS = new Set(['ul', 'ol', 'p', 'div', 'pre', 'blockquote', 'table']);

/**
 * Turns each changelog entry title, `- abc1234: **Title**`, into an h4 with a copyable anchor.
 * The id ends with the release (`#title-0360`), so a title repeated in a later release does not
 * move the anchor of an earlier one.
 * @returns {(tree: any, file: { path?: string }) => void}
 */
export default function rehypeChangelogEntryAnchors() {
  return (tree, file) => {
    if (!CHANGELOG_PAGE.test(file.path ?? '')) return;

    const usedIds = new Set();
    let release = null;

    tree.children = tree.children.flatMap(node => {
      if (node.type !== 'element') return [node];

      if (node.tagName === 'h2' && RELEASE.test(textOf(node).trim())) {
        release = textOf(node).trim();
        return [node];
      }

      if (node.tagName !== 'ul' || !release) return [node];

      return splitEntries(node, title =>
        uniqueId(`${slugify(title)}-${slugify(release)}`, usedIds)
      );
    });
  };
}

/**
 * Replaces each entry item of a list with its heading and body; other items stay in a list.
 * @param {any} list - `ul` element
 * @param {(title: string) => string} idFor - Heading id for an entry title
 * @returns {any[]} Nodes replacing the list
 */
function splitEntries(list, idFor) {
  const nodes = [];
  let otherItems = [];

  const flushOtherItems = () => {
    if (otherItems.some(item => item.type === 'element')) {
      nodes.push({ ...list, children: otherItems });
    }
    otherItems = [];
  };

  for (const item of list.children) {
    const entry = item.type === 'element' && item.tagName === 'li' ? entryOf(item) : null;
    if (!entry) {
      otherItems.push(item);
      continue;
    }
    flushOtherItems();
    nodes.push(
      {
        type: 'element',
        tagName: 'h4',
        properties: { id: idFor(textOf(entry.title)) },
        children: entry.title.children,
      },
      ...entry.body
    );
  }
  flushOtherItems();

  return nodes;
}

/**
 * Reads an entry item: its bold title after the commit hash, and everything below the title.
 * @param {any} item - `li` element
 * @returns {{ title: any, body: any[] } | null} The entry, or null when the item is not one
 */
function entryOf(item) {
  const firstIndex = item.children.findIndex(child => !isBlank(child));
  const first = item.children[firstIndex];

  // Loose list: the title is a paragraph of its own.
  if (first?.type === 'element' && first.tagName === 'p') {
    const title = boldTitle(first.children);
    return title && title.rest.length === 0
      ? { title: title.strong, body: item.children.slice(firstIndex + 1) }
      : null;
  }

  // Tight list: the title is inline, followed only by block content such as a nested list.
  const title = boldTitle(item.children);
  return title && title.rest.every(child => BLOCK_TAGS.has(child.tagName))
    ? { title: title.strong, body: title.rest }
    : null;
}

/**
 * @param {any[]} nodes - Inline nodes
 * @returns {{ strong: any, rest: any[] } | null} The bold title after the commit hash
 */
function boldTitle(nodes) {
  const [prefix, strong, ...rest] = nodes.filter(node => !isBlank(node));
  if (prefix?.type !== 'text' || !COMMIT_PREFIX.test(prefix.value)) return null;
  if (strong?.type !== 'element' || strong.tagName !== 'strong') return null;
  return { strong, rest };
}

/**
 * @param {any} node - hast node
 * @returns {boolean} True for whitespace-only text
 */
function isBlank(node) {
  return node.type === 'text' && node.value.trim() === '';
}

/**
 * @param {any} node - hast node
 * @returns {string} Concatenated text content
 */
function textOf(node) {
  if (node.type === 'text') return node.value;
  return (node.children ?? []).map(textOf).join('');
}

/**
 * Slugifies like github-slugger, which Astro uses for the other heading ids on the page.
 * @param {string} text - Heading text
 * @returns {string} Slug
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

/**
 * @param {string} id - Preferred id
 * @param {Set<string>} usedIds - Ids already on the page
 * @returns {string} The id, suffixed when it is already taken
 */
function uniqueId(id, usedIds) {
  let candidate = id;
  for (let n = 1; usedIds.has(candidate); n++) candidate = `${id}-${n}`;
  usedIds.add(candidate);
  return candidate;
}
