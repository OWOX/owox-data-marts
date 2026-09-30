import assert from 'node:assert/strict';
import test from 'node:test';

import rehypeChangelogEntryAnchors from './rehype-changelog-entry-anchors.js';

const CHANGELOG = '/site/src/content/docs/docs/changelog.md';

const text = value => ({ type: 'text', value });
const el = (tagName, children = [], properties = {}) => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const release = version => el('h2', [text(version)]);
const bold = (...children) => el('strong', children);
const entry = (hash, title, ...body) => el('li', [el('p', [text(`${hash}: `), title]), ...body]);

function transform(children, path = CHANGELOG) {
  const tree = { type: 'root', children };
  rehypeChangelogEntryAnchors()(tree, { path });
  return tree.children;
}

test('turns an entry title into an h4 whose id ends with the release', () => {
  const body = el('p', [text('Details')]);
  const [, heading, details] = transform([
    release('0.36.0'),
    el('ul', [entry('42c797b', bold(text('Preview Data Mart rows')), body)]),
  ]);

  assert.equal(heading.tagName, 'h4');
  assert.equal(heading.properties.id, 'preview-data-mart-rows-0360');
  assert.deepEqual(heading.children, [text('Preview Data Mart rows')]);
  assert.equal(details, body);
});

test('keeps the anchor of an earlier release when a later one repeats the title', () => {
  const ids = transform([
    release('0.36.0'),
    el('ul', [entry('aaaaaaa', bold(text('Bug fixes and improvements')))]),
    release('0.35.0'),
    el('ul', [entry('bbbbbbb', bold(text('Bug fixes and improvements')))]),
  ])
    .filter(node => node.tagName === 'h4')
    .map(node => node.properties.id);

  assert.deepEqual(ids, ['bug-fixes-and-improvements-0360', 'bug-fixes-and-improvements-0350']);
});

test('takes the title from a tight list item and keeps its nested list', () => {
  const nested = el('ul', [el('li', [text('Sub-item')])]);
  const [, heading, rest] = transform([
    release('0.10.0'),
    el('ul', [
      el('li', [
        text('dc9b5ab: '),
        bold(text('Use '), el('code', [text('x')]), text(' & y')),
        text('\n'),
        nested,
      ]),
    ]),
  ]);

  assert.equal(heading.properties.id, 'use-x--y-0100');
  assert.equal(rest, nested);
});

test('leaves items without a bold title in a list', () => {
  const plain = el('li', [text('edb4478: Google Tag Manager integration')]);
  const nodes = transform([
    release('0.5.0'),
    el('ul', [entry('25ab28e', bold(text('Viewer role fix'))), plain]),
  ]);

  assert.deepEqual(
    nodes.map(node => node.tagName),
    ['h2', 'h4', 'ul']
  );
  assert.deepEqual(nodes[2].children, [plain]);
});

test('changes no other page', () => {
  const list = el('ul', [entry('42c797b', bold(text('Title')))]);
  const nodes = transform([release('0.36.0'), list], '/site/src/content/docs/docs/api/index.md');

  assert.equal(nodes[1], list);
});
