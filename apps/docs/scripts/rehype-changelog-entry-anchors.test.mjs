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

const entryIds = nodes =>
  nodes
    .filter(node => node.tagName === 'ul')
    .flatMap(list => list.children)
    .map(item => item.properties?.id);

test('keeps the entry a list item and adds an anchor link after its title', () => {
  const title = bold(text('Preview Data Mart rows'));
  const body = el('p', [text('Details')]);
  const [, list] = transform([release('0.36.0'), el('ul', [entry('42c797b', title, body)])]);

  const [item] = list.children;
  const [titleLine, details] = item.children;
  const [prefix, strong, link] = titleLine.children;

  assert.equal(item.tagName, 'li');
  assert.equal(item.properties.id, 'preview-data-mart-rows-0360');
  assert.deepEqual(prefix, text('42c797b: '));
  assert.equal(strong, title);
  assert.equal(link.tagName, 'a');
  assert.equal(link.properties.href, '#preview-data-mart-rows-0360');
  assert.deepEqual(link.properties.className, ['sl-anchor-link', 'changelog-entry-anchor']);
  assert.equal(details, body);
});

test('keeps the anchor of an earlier release when a later one repeats the title', () => {
  const ids = entryIds(
    transform([
      release('0.36.0'),
      el('ul', [entry('aaaaaaa', bold(text('Bug fixes and improvements')))]),
      release('0.35.0'),
      el('ul', [entry('bbbbbbb', bold(text('Bug fixes and improvements')))]),
    ])
  );

  assert.deepEqual(ids, ['bug-fixes-and-improvements-0360', 'bug-fixes-and-improvements-0350']);
});

test('anchors a tight list item and keeps its nested list', () => {
  const title = bold(text('Use '), el('code', [text('x')]), text(' & y'));
  const nested = el('ul', [el('li', [text('Sub-item')])]);
  const [, list] = transform([
    release('0.10.0'),
    el('ul', [el('li', [text('dc9b5ab: '), title, text('\n'), nested])]),
  ]);

  const [item] = list.children;
  assert.equal(item.properties.id, 'use-x--y-0100');
  assert.deepEqual(
    item.children.map(node => node.tagName ?? node.value),
    ['dc9b5ab: ', 'strong', 'a', '\n', 'ul']
  );
  assert.equal(item.children[4], nested);
});

test('leaves items without a bold title as they are', () => {
  const plain = el('li', [text('edb4478: Google Tag Manager integration')]);
  const ids = entryIds(
    transform([
      release('0.5.0'),
      el('ul', [entry('25ab28e', bold(text('Viewer role fix'))), plain]),
    ])
  );

  assert.deepEqual(ids, ['viewer-role-fix-050', undefined]);
  assert.deepEqual(plain.children, [text('edb4478: Google Tag Manager integration')]);
});

test('changes no other page', () => {
  const item = entry('42c797b', bold(text('Title')));
  transform([release('0.36.0'), el('ul', [item])], '/site/src/content/docs/docs/api/index.md');

  assert.deepEqual(item.properties, {});
  assert.equal(item.children[0].children.length, 2);
});
