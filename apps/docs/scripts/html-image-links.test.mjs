import assert from 'node:assert/strict';
import test from 'node:test';

import { rewriteHtmlImageLinks } from './html-image-links.mjs';

const ROOT = '/repo';
const existing = new Set([
  '/repo/docs/res/icons/a.svg',
  '/repo/docs/res/dark.svg',
  '/repo/docs/res/light.svg',
  '/repo/docs/res/light@2x.svg',
  '/repo/packages/x/pic.png',
]);

/** @param {string} content @param {Partial<Parameters<typeof rewriteHtmlImageLinks>[1]>} [opts] */
const run = (content, opts = {}) =>
  rewriteHtmlImageLinks(content, {
    sourceDir: ROOT,
    monorepoRoot: ROOT,
    base: '',
    fileExists: p => existing.has(p),
    ...opts,
  });

test('rewrites img src and reports the copy', () => {
  const r = run('<img src="./docs/res/icons/a.svg" width="20">');
  assert.equal(r.content, '<img src="/docs/res/icons/a.svg" width="20">');
  assert.deepEqual(r.copies, [
    { from: '/repo/docs/res/icons/a.svg', publicPath: 'docs/res/icons/a.svg' },
  ]);
});

test('rewrites picture source srcset and img src', () => {
  const r = run(
    '<picture><source media="(prefers-color-scheme: dark)" srcset="./docs/res/dark.svg"><img alt="x" src="./docs/res/light.svg"></picture>'
  );
  assert.equal(
    r.content,
    '<picture><source media="(prefers-color-scheme: dark)" srcset="/docs/res/dark.svg"><img alt="x" src="/docs/res/light.svg"></picture>'
  );
  assert.equal(r.copies.length, 2);
});

test('rewrites every srcset candidate and keeps descriptors', () => {
  const r = run('<img srcset="./docs/res/light.svg 1x, ./docs/res/light@2x.svg 2x">');
  assert.equal(r.content, '<img srcset="/docs/res/light.svg 1x, /docs/res/light@2x.svg 2x">');
});

test('leaves absolute, remote and data URLs alone', () => {
  const html = [
    '<img src="/already/abs.svg">',
    '<img src="https://x.com/a.svg">',
    '<img src="http://x.com/a.svg">',
    '<img src="//cdn.x.com/a.svg">',
    '<img src="data:image/png;base64,AAAA">',
  ].join('\n');
  const r = run(html);
  assert.equal(r.content, html);
  assert.deepEqual(r.copies, []);
});

test('leaves a missing file unchanged', () => {
  const html = '<img src="./docs/res/nope.svg">';
  const r = run(html);
  assert.equal(r.content, html);
  assert.deepEqual(r.copies, []);
});

test('leaves a path escaping the monorepo unchanged', () => {
  const html = '<img src="../outside.svg">';
  assert.equal(run(html, { fileExists: () => true }).content, html);
});

test('handles single quotes and keeps the rest of the tag', () => {
  const r = run("<img  alt='a' src='./docs/res/icons/a.svg'  />");
  assert.equal(r.content, "<img  alt='a' src='/docs/res/icons/a.svg'  />");
});

test('resolves relative to the source directory and keeps query and hash', () => {
  const r = run('<img src="../res/icons/a.svg?v=1#x">', { sourceDir: '/repo/docs/sub' });
  assert.equal(r.content, '<img src="/docs/res/icons/a.svg?v=1#x">');
});

test('skips fenced code blocks and inline code', () => {
  const html = [
    '```html',
    '<img src="./docs/res/icons/a.svg">',
    '```',
    'Use `<img src="./docs/res/icons/a.svg">` here:',
    '<img src="./docs/res/icons/a.svg">',
  ].join('\n');
  const r = run(html);
  assert.equal(
    r.content,
    [
      '```html',
      '<img src="./docs/res/icons/a.svg">',
      '```',
      'Use `<img src="./docs/res/icons/a.svg">` here:',
      '<img src="/docs/res/icons/a.svg">',
    ].join('\n')
  );
  assert.equal(r.copies.length, 1);
});

test('prefixes the site base, without a double slash', () => {
  const html = '<img src="./docs/res/icons/a.svg">';
  assert.equal(run(html, { base: '' }).content, '<img src="/docs/res/icons/a.svg">');
  assert.equal(run(html, { base: '/' }).content, '<img src="/docs/res/icons/a.svg">');
  assert.equal(
    run(html, { base: '/docs-base' }).content,
    '<img src="/docs-base/docs/res/icons/a.svg">'
  );
});

test('publishes files outside docs/ under _repo/', () => {
  const r = run('<img src="./packages/x/pic.png">');
  assert.equal(r.content, '<img src="/_repo/packages/x/pic.png">');
  assert.deepEqual(r.copies, [
    { from: '/repo/packages/x/pic.png', publicPath: '_repo/packages/x/pic.png' },
  ]);
});
