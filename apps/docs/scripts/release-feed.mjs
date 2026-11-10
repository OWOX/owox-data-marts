// @ts-check
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * The release feed the web app reads to announce a new release in the product.
 *
 * For each recent release the feed carries its date, the titles of its changes and, once it is
 * in the changelog, its what's-new video: the video line sits right after
 * `### Minor Changes <version>` (or `### Major Changes`), followed by one chapter line per scene,
 * e.g. `[0:41](<player>?startTime=41s) - <scene title>`. The app announces a release as soon as
 * its video is out, and a release without one only some days after its date, so features that
 * reached production during the week are announced together with their release video.
 *
 * The web app parses this file in apps/web/src/features/whats-new/api/release-feed.ts and drops
 * any release that does not match its schema, so change both together.
 */

/**
 * @typedef {{ title: string, startTime: number, label: string }} ReleaseChapter
 * @typedef {{
 *   version: string,
 *   releasedAt: string | null,
 *   videoUrl: string | null,
 *   chapters: ReleaseChapter[],
 *   changes: string[],
 * }} FeedRelease
 * @typedef {{ releases: FeedRelease[] }} ReleaseFeed
 */

/** Older releases are of no use to an announcement and only grow the file. */
export const MAX_FEED_RELEASES = 20;

const VERSION_HEADING = /^## (\d+\.\d+\.\d+)$/;
const RELEASE_NOTES_HEADING = /^### (?:Major|Minor) Changes\b/;
const VIDEO_LINE = /^<?(https:\/\/customer-[a-z0-9]+\.cloudflarestream\.com\/[0-9a-f]+\/iframe)>?$/;
const CHAPTER_LINE = /^\[(\d+:\d{2})\]\(([^)?\s]+)\?startTime=(\d+(?:\.\d+)?)s\)\s+-\s+(.+?)\\?$/;
// One entry may list several changeset hashes: `- dc3b2ad, 4bfd303: **Title**`.
const ENTRY_LINE = /^- [0-9a-f]{7,}(?:, [0-9a-f]{7,})*: (.*)$/;
const BOLD_TITLE = /^\*\*(.+)\*\*$/;

/** A changelog title as plain text: no code spans, links reduced to their text. */
function plainTitle(title) {
  return title
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .trim();
}

/**
 * Reads the recent releases from `apps/owox/CHANGELOG.md`, newest first. A release is listed when
 * it has a video or at least one major or minor change; patch-only releases are left out.
 *
 * @param {string} changelog
 * @param {{ releaseDates?: Record<string, string> }} [options] version → ISO date it shipped
 * @returns {ReleaseFeed}
 */
export function parseReleaseFeed(changelog, { releaseDates = {} } = {}) {
  /** @type {FeedRelease[]} */
  const releases = [];
  /** @type {FeedRelease | null} */
  let release = null;
  let inReleaseNotes = false;
  let beforeFirstEntry = false;
  let awaitingTitle = false;

  for (const rawLine of changelog.split(/\r?\n/)) {
    const line = rawLine.trim();

    const version = VERSION_HEADING.exec(line);
    if (version) {
      release = {
        version: version[1],
        releasedAt: releaseDates[version[1]] ?? null,
        videoUrl: null,
        chapters: [],
        changes: [],
      };
      releases.push(release);
      inReleaseNotes = false;
      continue;
    }
    if (!release) continue;

    if (line.startsWith('### ')) {
      inReleaseNotes = RELEASE_NOTES_HEADING.test(line);
      beforeFirstEntry = inReleaseNotes;
      awaitingTitle = false;
      continue;
    }
    if (!inReleaseNotes) continue;

    const entry = ENTRY_LINE.exec(line);
    if (entry) {
      beforeFirstEntry = false;
      const sameLineTitle = BOLD_TITLE.exec(entry[1].trim());
      if (sameLineTitle) release.changes.push(plainTitle(sameLineTitle[1]));
      // An entry may open with a markdownlint comment and put its bold title on a later line;
      // an entry without a bold title has none, and a bold line in its body is not one.
      awaitingTitle = !sameLineTitle && entry[1].trim().startsWith('<!--');
      continue;
    }
    if (awaitingTitle) {
      const title = BOLD_TITLE.exec(line);
      if (title) {
        release.changes.push(plainTitle(title[1]));
        awaitingTitle = false;
      }
      continue;
    }

    // The video and its chapters come before the first entry of the section.
    if (!beforeFirstEntry) continue;
    const video = VIDEO_LINE.exec(line);
    if (video && !release.videoUrl) {
      release.videoUrl = video[1];
      continue;
    }
    const chapter = CHAPTER_LINE.exec(line);
    if (chapter && release.videoUrl && chapter[2] === release.videoUrl) {
      release.chapters.push({
        title: chapter[4].trim(),
        startTime: Number(chapter[3]),
        // The changelog's own label: it can differ from startTime by a fraction of a second.
        label: chapter[1],
      });
    }
  }

  return {
    releases: releases.filter(r => r.videoUrl || r.changes.length > 0).slice(0, MAX_FEED_RELEASES),
  };
}

/**
 * When each version first appeared in the changelog, from `git log -p` output made with
 * `--reverse --format='COMMIT_DATE %cI'`. Returns version → ISO date in UTC.
 *
 * @param {string} gitLog
 * @returns {Record<string, string>}
 */
export function parseReleaseDates(gitLog) {
  /** @type {Record<string, string>} */
  const dates = {};
  let commitDate = '';
  for (const line of gitLog.split(/\r?\n/)) {
    if (line.startsWith('COMMIT_DATE ')) {
      commitDate = line.slice('COMMIT_DATE '.length).trim();
      continue;
    }
    const added = /^\+## (\d+\.\d+\.\d+)$/.exec(line);
    if (added && commitDate && !(added[1] in dates)) {
      const time = Date.parse(commitDate);
      if (!Number.isNaN(time)) dates[added[1]] = new Date(time).toISOString();
    }
  }
  return dates;
}

/**
 * Release dates from the repository history. A shallow clone does not have it, so it gives no
 * dates rather than wrong ones; releases without a video are then not announced at all.
 *
 * @param {string} repositoryRoot
 * @param {string} changelogPath
 * @returns {Record<string, string>}
 */
export function readReleaseDates(repositoryRoot, changelogPath) {
  try {
    const git = (/** @type {string[]} */ ...args) =>
      execFileSync('git', args, {
        cwd: repositoryRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
    if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
      console.warn('Release feed: shallow clone, so releases get no dates.');
      return {};
    }
    return parseReleaseDates(
      git(
        'log',
        '--reverse',
        '--format=COMMIT_DATE %cI',
        '-p',
        '--',
        path.relative(repositoryRoot, changelogPath)
      )
    );
  } catch (error) {
    console.warn(`Release feed: no release dates (${String(error)}).`);
    return {};
  }
}
