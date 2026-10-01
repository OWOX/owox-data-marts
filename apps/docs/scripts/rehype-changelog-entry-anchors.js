// @ts-check

const CHANGELOG_PAGE = /[\\/]docs[\\/]changelog\.md$/;
const RELEASE = /^\d+\.\d+\.\d+$/;
const COMMIT_PREFIX = /^[0-9a-f]{7,40}: $/;
const BLOCK_TAGS = new Set(['ul', 'ol', 'p', 'div', 'pre', 'blockquote', 'table']);

// Starlight's `link-alt` icon, the one its heading anchors use.
const LINK_ICON_PATH =
  'm12.11 15.39-3.88 3.88a2.52 2.52 0 0 1-3.5 0 2.47 2.47 0 0 1 0-3.5l3.88-3.88a1 1 0 1 0-1.42-1.42l-3.88 3.89a4.48 4.48 0 0 0 6.33 6.33l3.89-3.88a1 1 0 0 0-1.42-1.42m8.58-12.08a4.49 4.49 0 0 0-6.33 0l-3.89 3.88a1 1 0 1 0 1.42 1.42l3.88-3.88a2.52 2.52 0 0 1 3.5 0 2.47 2.47 0 0 1 0 3.5l-3.88 3.88a1 1 0 0 0 0 1.42 1 1 0 0 0 1.42 0l3.88-3.89a4.49 4.49 0 0 0 0-6.33M8.83 15.17a1 1 0 0 0 .71.29 1 1 0 0 0 .71-.29l4.92-4.92a1 1 0 1 0-1.42-1.42l-4.92 4.92a1 1 0 0 0 0 1.42';

/**
 * Gives each changelog entry, `- abc1234: **Title**`, an id and a copy-link icon after its title,
 * like Starlight's heading anchors. The entry stays a list item. The id ends with the release
 * (`#title-0360`), so a title repeated in a later release does not move the anchor of an earlier
 * one.
 * @returns {(tree: any, file: { path?: string }) => void}
 */
export default function rehypeChangelogEntryAnchors() {
  return (tree, file) => {
    if (!CHANGELOG_PAGE.test(file.path ?? '')) return;

    const usedIds = new Set();
    let release = null;

    for (const node of tree.children) {
      if (node.type !== 'element') continue;

      if (node.tagName === 'h2' && RELEASE.test(textOf(node).trim())) {
        release = textOf(node).trim();
        continue;
      }

      if (node.tagName !== 'ul' || !release) continue;

      for (const item of node.children) {
        const title = item.type === 'element' && item.tagName === 'li' ? entryTitle(item) : null;
        if (!title) continue;

        const titleText = textOf(title.strong);
        const id = uniqueId(`${slugify(titleText)}-${slugify(release)}`, usedIds);
        item.properties.id = id;
        const index = title.parent.children.indexOf(title.strong);
        title.parent.children.splice(index + 1, 0, anchorLink(id, titleText));
      }
    }
  };
}

/**
 * Finds the bold title of an entry item, after the commit hash.
 * @param {any} item - `li` element
 * @returns {{ parent: any, strong: any } | null} The title and the node holding it, or null when
 *   the item is not an entry
 */
function entryTitle(item) {
  const first = item.children.find(child => !isBlank(child));

  // Loose list: the title is a paragraph of its own.
  if (first?.type === 'element' && first.tagName === 'p') {
    const title = boldTitle(first.children);
    return title && title.rest.length === 0 ? { parent: first, strong: title.strong } : null;
  }

  // Tight list: the title is inline, followed only by block content such as a nested list.
  const title = boldTitle(item.children);
  return title && title.rest.every(child => BLOCK_TAGS.has(child.tagName))
    ? { parent: item, strong: title.strong }
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
 * Builds the same anchor link Starlight appends to headings.
 * @param {string} id - Entry id
 * @param {string} title - Entry title, for the screen-reader label
 * @returns {any} `a` element
 */
function anchorLink(id, title) {
  return {
    type: 'element',
    tagName: 'a',
    properties: { className: ['sl-anchor-link', 'changelog-entry-anchor'], href: `#${id}` },
    children: [
      {
        type: 'element',
        tagName: 'span',
        properties: { ariaHidden: 'true', className: ['sl-anchor-icon'] },
        children: [
          {
            type: 'element',
            tagName: 'svg',
            properties: { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor' },
            children: [
              { type: 'element', tagName: 'path', properties: { d: LINK_ICON_PATH }, children: [] },
            ],
          },
        ],
      },
      {
        type: 'element',
        tagName: 'span',
        properties: { className: ['sr-only'], dataPagefindIgnore: true },
        children: [{ type: 'text', value: `Section titled “${title}”` }],
      },
    ],
  };
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
