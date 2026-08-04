import type { ModelGraph, ModelGraphNode } from '../model-graph';
import { slugify } from '../slug';
import { renderFrontmatter } from './frontmatter';

/** Keep a value from breaking out of its Markdown table cell. */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
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

// Map each of a node's own FK columns to the target mart it points at, so the
// FK note can be rendered inside that column's Description cell.
function fkColumns(
  node: ModelGraphNode,
  graph: ModelGraph,
  slugByKey: Map<string, string>
): Map<string, { title: string; slug: string }> {
  const out = new Map<string, { title: string; slug: string }>();
  for (const edge of graph.edges) {
    if (edge.from === node.key) {
      const target = graph.nodes.find(other => other.key === edge.to);
      if (!target) continue;
      const slug = slugByKey.get(edge.to);
      if (!slug) continue;
      for (const key of edge.keys) out.set(key.left, { title: target.title, slug });
    } else if (edge.bidirectional && edge.to === node.key) {
      const target = graph.nodes.find(other => other.key === edge.from);
      if (!target) continue;
      const slug = slugByKey.get(edge.from);
      if (!slug) continue;
      for (const key of edge.keys) out.set(key.right, { title: target.title, slug });
    }
  }
  return out;
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

  const fk = fkColumns(node, graph, slugByKey);
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
          const parts: string[] = [];
          if (field.pk) parts.push('PK.');
          const ref = fk.get(field.name);
          if (ref) parts.push(`FK to [${escapeLinkText(ref.title)}](./${ref.slug}.md)`);
          const cells = withAlias
            ? [`\`${field.name}\``, field.type, field.alias ?? '', parts.join(' ').trim()]
            : [`\`${field.name}\``, field.type, parts.join(' ').trim()];
          return `| ${cells.map(escapeTableCell).join(' | ')} |`;
        })
        .join('\n') +
      '\n\n'
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

  return `---\n${frontmatter}\n---\n\n# ${node.title}\n${node.description ? '\n' + node.description + '\n' : ''}\n${overview}${schema}${joins}`;
}
