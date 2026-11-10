import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_FEED_RELEASES, parseReleaseDates, parseReleaseFeed } from './release-feed.mjs';

const PLAYER =
  'https://customer-abc123.cloudflarestream.com/d7dde8721ec80ac8b1b98ec6c597e6c3/iframe';
const OLD_PLAYER =
  'https://customer-abc123.cloudflarestream.com/19d267c9d08a943afaa7894f2d1c54df/iframe';

const CHANGELOG = `# owox

## 0.42.0

### Minor Changes 0.42.0

- 1111111: **Shipped this week, \`video\` not recorded yet**

  The body of the entry, with **a bold label** inside.

- 2222222: <!-- markdownlint-disable-file MD041 MD036 -->

  **A title on its own line**

  - **A list label.** Not a title.

## 0.41.0

### Minor Changes 0.41.0

<${PLAYER}>

[0:11](${PLAYER}?startTime=11.4s) - Your AI Assistant Sets Up Contexts\\
[0:39](${PLAYER}?startTime=40.1s) - Build a Data Mart on Top of Another\\
[1:27](${PLAYER}?startTime=87.8s) - And a Few More Things

- f66ac98: **Safer sign-in**

  [0:05](${PLAYER}?startTime=5s) - A link inside an entry is not a chapter

### Patch Changes 0.41.0

- 3333333: **A fix**

## 0.40.1

### Patch Changes 0.40.1

- 4444444: **Patch only**

## 0.39.0

### Minor Changes 0.39.0

${OLD_PLAYER}

- 9e9168f: **See who published a plugin in [Plugin history](../../docs/plugins.md)**
`;

const DATES = { '0.42.0': '2026-11-09T14:43:46.000Z', '0.41.0': '2026-11-02T14:23:04.000Z' };

test('lists releases with a video or changes, newest first, without patch-only ones', () => {
  const { releases } = parseReleaseFeed(CHANGELOG);
  assert.deepEqual(
    releases.map(r => r.version),
    ['0.42.0', '0.41.0', '0.39.0']
  );
});

test('reads the video and the chapters that follow it', () => {
  const release = parseReleaseFeed(CHANGELOG).releases[1];
  assert.equal(release.videoUrl, PLAYER);
  assert.deepEqual(release.chapters, [
    { title: 'Your AI Assistant Sets Up Contexts', startTime: 11.4, label: '0:11' },
    { title: 'Build a Data Mart on Top of Another', startTime: 40.1, label: '0:39' },
    { title: 'And a Few More Things', startTime: 87.8, label: '1:27' },
  ]);
});

test('reads the titles of major and minor changes as plain text', () => {
  const [latest, withVideo, oldest] = parseReleaseFeed(CHANGELOG).releases;
  assert.deepEqual(latest.changes, [
    'Shipped this week, video not recorded yet',
    'A title on its own line',
  ]);
  assert.equal(latest.videoUrl, null);
  assert.deepEqual(withVideo.changes, ['Safer sign-in']);
  assert.deepEqual(oldest.changes, ['See who published a plugin in Plugin history']);
});

test('accepts a bare player line and a release without chapters', () => {
  const release = parseReleaseFeed(CHANGELOG).releases[2];
  assert.equal(release.videoUrl, OLD_PLAYER);
  assert.deepEqual(release.chapters, []);
});

test('dates each release when the date is known', () => {
  const releases = parseReleaseFeed(CHANGELOG, { releaseDates: DATES }).releases;
  assert.deepEqual(
    releases.map(r => r.releasedAt),
    ['2026-11-09T14:43:46.000Z', '2026-11-02T14:23:04.000Z', null]
  );
});

test('ignores chapters of another video', () => {
  const changelog = `## 1.0.0

### Minor Changes 1.0.0

<${PLAYER}>

[0:10](${OLD_PLAYER}?startTime=10s) - Not this video
`;
  assert.deepEqual(parseReleaseFeed(changelog).releases[0].chapters, []);
});

test('announces a major release too', () => {
  const changelog = `## 1.0.0

### Major Changes 1.0.0

<${PLAYER}>

- 5555555: **A breaking change**
`;
  const [release] = parseReleaseFeed(changelog).releases;
  assert.equal(release.version, '1.0.0');
  assert.deepEqual(release.changes, ['A breaking change']);
});

test(`keeps the newest ${MAX_FEED_RELEASES} releases`, () => {
  const changelog = Array.from(
    { length: MAX_FEED_RELEASES + 5 },
    (_, i) =>
      `## 0.${100 - i}.0\n\n### Minor Changes 0.${100 - i}.0\n\n- abcdef0: **Change ${i}**\n`
  ).join('\n');
  const { releases } = parseReleaseFeed(changelog);
  assert.equal(releases.length, MAX_FEED_RELEASES);
  assert.equal(releases[0].version, '0.100.0');
});

test('returns no releases for an empty changelog', () => {
  assert.deepEqual(parseReleaseFeed(''), { releases: [] });
});

test('dates a version by the first commit that added its heading', () => {
  const gitLog = [
    'COMMIT_DATE 2026-11-02T06:23:04-08:00',
    '+## 0.41.0',
    '+### Minor Changes 0.41.0',
    'COMMIT_DATE 2026-11-03T10:00:00+02:00',
    '+## 0.41.0',
    'COMMIT_DATE not-a-date',
    '+## 0.42.0',
    'COMMIT_DATE 2026-11-09T06:43:46-08:00',
    '+## 0.42.0',
    '-## 0.40.0',
  ].join('\n');
  assert.deepEqual(parseReleaseDates(gitLog), {
    '0.41.0': '2026-11-02T14:23:04.000Z',
    '0.42.0': '2026-11-09T14:43:46.000Z',
  });
});
