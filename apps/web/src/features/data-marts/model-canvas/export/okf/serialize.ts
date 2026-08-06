import type { ModelGraph, ModelGraphNode } from '../model-graph';
import { slugify } from '../slug';
import { renderFrontmatter } from './frontmatter';

/**
 * Keep a value from breaking out of its Markdown table cell. The HTML entity is
 * used instead of the GFM `\|` escape because the Model Canvas importer splits
 * rows on every raw pipe without recognizing backslash escapes, which would
 * truncate the cell on re-import; `&#124;` renders as `|` and survives the
 * split intact.
 */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '&#124;');
}

/** Keep a title from terminating its `[text](./slug.md)` link early. */
function escapeLinkText(value: string): string {
  return value.replace(/([[\]])/g, '\\$1');
}

// OKF (Open Knowledge Format) bundle: one Markdown document per data mart plus
// an index, matching the format model.owox.com produces and imports. Joins are
// rendered as `- [Title](./slug.md) — \`left = right\`` — the link target slug
// must equal the target document's filename, which is why one slug map feeds
// both the filenames and every cross-reference.

const OKF_FOOTER =
  '\n\n---\n\n_Generated with [OWOX Data Marts](https://www.owox.com/) · ' +
  '[open source](https://github.com/OWOX/owox-data-marts)_\n';

export interface OkfBundle {
  files: Record<string, string>;
}

export function serializeOkfBundle(graph: ModelGraph, bundleTitle = 'Data Marts'): OkfBundle {
  const folder = slugify(bundleTitle, 'data-marts');
  const slugByKey = new Map<string, string>();
  const taken = new Set<string>();
  for (const node of graph.nodes) {
    const base = slugify(node.title, node.key);
    let unique = base;
    let suffix = 2;
    while (taken.has(unique)) unique = `${base}-${String(suffix++)}`;
    taken.add(unique);
    slugByKey.set(node.key, unique);
  }

  const files: Record<string, string> = {};
  for (const node of graph.nodes) {
    files[`${folder}/${slugByKey.get(node.key) ?? node.key}.md`] = renderNode(
      node,
      graph,
      slugByKey
    );
  }

  const rows = graph.nodes
    .map(
      node =>
        `| [${escapeLinkText(escapeTableCell(node.title))}](./${slugByKey.get(node.key) ?? node.key}.md) | ${node.inputSource} | ${escapeTableCell(graph.storageId ?? '—')} |`
    )
    .join('\n');
  files[`${folder}/index.md`] = `---\n${renderFrontmatter({
    type: 'index',
    title: bundleTitle,
    description: 'Index of exported OWOX data marts.',
    tags: ['owox', 'index'],
  })}\n---\n\n# ${bundleTitle}\n\n| Data Mart | Type | Storage |\n|-----------|------|---------|\n${rows}\n${OKF_FOOTER}`;

  return { files };
}

function renderNode(
  node: ModelGraphNode,
  graph: ModelGraph,
  slugByKey: Map<string, string>
): string {
  const frontmatter = renderFrontmatter({
    type: 'OWOX Data Mart',
    title: node.title,
    description: node.description === '' ? undefined : node.description,
    tags: ['owox', node.inputSource.toLowerCase()],
  });

  const overview = [
    '## Overview',
    '',
    `- **Status:** ${node.status === 'created' ? 'PUBLISHED' : 'DRAFT'}`,
    `- **Definition type:** ${node.inputSource}`,
    `- **Storage:** ${graph.storageId ?? '—'}`,
    '',
  ].join('\n');

  // The Alias column is emitted only when some field has one, so marts without
  // aliases keep the leaner 3-column table.
  const withAlias = node.schema.some(field => field.alias);
  const header = withAlias
    ? '| Column | Type | Alias | Description |\n|--------|------|-------|-------------|\n'
    : '| Column | Type | Description |\n|--------|------|-------------|\n';
  const schema = node.schema.length
    ? '# Schema\n\n' +
      header +
      node.schema
        .map(field => {
          // The Description cell carries the PK marker and the business
          // description; relationships live only in the Joins section (a
          // deliberate divergence from model.owox.com, which also annotates FK
          // columns here — its parser reads joins from the Joins keys first,
          // so the round-trip is unaffected).
          const parts: string[] = [];
          if (field.pk) parts.push('PK.');
          // Newlines would end the Markdown table row, so multi-line
          // descriptions collapse to a single line.
          if (field.description) parts.push(field.description.replace(/\s+/g, ' ').trim());
          const cells = withAlias
            ? [`\`${field.name}\``, field.type, field.alias ?? '', parts.join(' ').trim()]
            : [`\`${field.name}\``, field.type, parts.join(' ').trim()];
          return `| ${cells.map(escapeTableCell).join(' | ')} |`;
        })
        .join('\n') +
      '\n\n'
    : '';

  // A definition line starting with three-plus backticks would close the fence
  // early (and the Model Canvas parser cuts at the first such line). A single
  // leading space keeps the line inert for both renderers; inside SQL it can
  // only occur in comments or string literals, where the space is harmless.
  const definitionText = node.definition?.trim().replace(/^( {0,3})(`{3,})/gm, ' $1$2');
  const definition = definitionText
    ? `## Definition\n\n\`\`\`${node.inputSource === 'SQL' ? 'sql' : 'text'}\n${definitionText}\n\`\`\`\n\n`
    : '';

  const outgoing = graph.edges.filter(
    edge => edge.from === node.key || (edge.bidirectional && edge.to === node.key)
  );
  const joins = outgoing.length
    ? '## Joins\n\n' +
      outgoing
        .map(edge => {
          const forward = edge.from === node.key;
          const otherKey = forward ? edge.to : edge.from;
          const other = graph.nodes.find(candidate => candidate.key === otherKey);
          const slug = slugByKey.get(otherKey);
          if (!other || !slug) return null;
          const keys = forward
            ? edge.keys
            : edge.keys.map(key => ({ left: key.right, right: key.left }));
          const condition = keys.map(key => `\`${key.left} = ${key.right}\``).join(', ');
          return `- [${escapeLinkText(other.title)}](./${slug}.md) — ${condition}`;
        })
        .filter(Boolean)
        .join('\n') +
      '\n'
    : '';

  return `---\n${frontmatter}\n---\n\n# ${node.title}\n${node.description ? '\n' + node.description + '\n' : ''}\n${overview}${schema}${definition}${joins}`;
}
