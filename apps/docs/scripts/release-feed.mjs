// @ts-check

/**
 * The release feed the web app reads to announce a new release in the product.
 *
 * A release is announced once its what's-new video is in the changelog: the video line sits
 * right after `### Minor Changes <version>` (or `### Major Changes`), followed by one chapter
 * line per scene, e.g. `[0:41](<player>?startTime=41s) - <scene title>`. Releases without a
 * video are left out, so features that already reached production are not announced before
 * their release video.
 */

/**
 * @typedef {{ title: string, startTime: number, label: string }} ReleaseChapter
 * @typedef {{ version: string, videoUrl: string, chapters: ReleaseChapter[] }} AnnouncedRelease
 * @typedef {{ releases: AnnouncedRelease[] }} ReleaseFeed
 */

const VERSION_HEADING = /^## (\d+\.\d+\.\d+)$/;
const RELEASE_NOTES_HEADING = /^### (?:Major|Minor) Changes\b/;
const VIDEO_LINE = /^<?(https:\/\/customer-[a-z0-9]+\.cloudflarestream\.com\/[0-9a-f]+\/iframe)>?$/;
const CHAPTER_LINE = /^\[(\d+:\d{2})\]\(([^)?\s]+)\?startTime=(\d+(?:\.\d+)?)s\)\s+-\s+(.+?)\\?$/;

/**
 * Reads the announced releases from `apps/owox/CHANGELOG.md`, newest first.
 *
 * @param {string} changelog
 * @returns {ReleaseFeed}
 */
export function parseReleaseFeed(changelog) {
  /** @type {AnnouncedRelease[]} */
  const releases = [];
  /** @type {{ version: string, videoUrl: string | null, chapters: ReleaseChapter[] } | null} */
  let release = null;
  let inReleaseNotesHeader = false;

  for (const rawLine of changelog.split(/\r?\n/)) {
    const line = rawLine.trim();

    const version = VERSION_HEADING.exec(line);
    if (version) {
      release = { version: version[1], videoUrl: null, chapters: [] };
      inReleaseNotesHeader = false;
      continue;
    }
    if (!release) continue;

    if (line.startsWith('### ')) {
      inReleaseNotesHeader = RELEASE_NOTES_HEADING.test(line);
      continue;
    }
    // The video and its chapters come before the first entry of the section.
    if (!inReleaseNotesHeader) continue;
    if (line.startsWith('- ')) {
      inReleaseNotesHeader = false;
      continue;
    }

    const video = VIDEO_LINE.exec(line);
    if (video && !release.videoUrl) {
      release.videoUrl = video[1];
      releases.push(/** @type {AnnouncedRelease} */ (release));
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

  return { releases };
}
