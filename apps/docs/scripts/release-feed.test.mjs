import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReleaseFeed } from './release-feed.mjs';

const PLAYER =
  'https://customer-abc123.cloudflarestream.com/d7dde8721ec80ac8b1b98ec6c597e6c3/iframe';
const OLD_PLAYER =
  'https://customer-abc123.cloudflarestream.com/19d267c9d08a943afaa7894f2d1c54df/iframe';

const CHANGELOG = `# owox

## 0.42.0

### Minor Changes 0.42.0

- 1111111: **Shipped this week, video not recorded yet**

## 0.41.0

### Minor Changes 0.41.0

<${PLAYER}>

[0:11](${PLAYER}?startTime=11.4s) - Your AI Assistant Sets Up Contexts\\
[0:39](${PLAYER}?startTime=40.1s) - Build a Data Mart on Top of Another\\
[1:27](${PLAYER}?startTime=87.8s) - And a Few More Things

- f66ac98: **Safer sign-in**

  [0:05](${PLAYER}?startTime=5s) - A link inside an entry is not a chapter

### Patch Changes 0.41.0

- 2222222: **A fix**

## 0.40.1

### Patch Changes 0.40.1

- 3333333: **Patch only**

## 0.39.0

### Minor Changes 0.39.0

${OLD_PLAYER}

- 9e9168f: **See who published a plugin in Plugin history**
`;

test('lists releases that have a video, newest first', () => {
  const { releases } = parseReleaseFeed(CHANGELOG);
  assert.deepEqual(
    releases.map(r => r.version),
    ['0.41.0', '0.39.0']
  );
});

test('reads the video and the chapters that follow it', () => {
  const [release] = parseReleaseFeed(CHANGELOG).releases;
  assert.equal(release.videoUrl, PLAYER);
  assert.deepEqual(release.chapters, [
    { title: 'Your AI Assistant Sets Up Contexts', startTime: 11.4, label: '0:11' },
    { title: 'Build a Data Mart on Top of Another', startTime: 40.1, label: '0:39' },
    { title: 'And a Few More Things', startTime: 87.8, label: '1:27' },
  ]);
});

test('accepts a bare player line and a release without chapters', () => {
  const release = parseReleaseFeed(CHANGELOG).releases[1];
  assert.equal(release.videoUrl, OLD_PLAYER);
  assert.deepEqual(release.chapters, []);
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

- 4444444: **A breaking change**
`;
  assert.deepEqual(
    parseReleaseFeed(changelog).releases.map(r => r.version),
    ['1.0.0']
  );
});

test('returns no releases for an empty changelog', () => {
  assert.deepEqual(parseReleaseFeed(''), { releases: [] });
});
