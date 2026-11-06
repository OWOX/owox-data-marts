const CHANGELOG_URL = 'https://docs.owox.com/docs/changelog/';
const CHANGELOG_UTM = 'utm_source=owox-data-marts&utm_medium=ui&utm_campaign=whats-new-popover';

/** The release's section of the public changelog, e.g. `#0410` for 0.41.0. */
export function changelogUrl(version: string): string {
  return `${CHANGELOG_URL}?${CHANGELOG_UTM}#${version.replace(/\./g, '')}`;
}

/** The release video, started from a chapter when one is picked. */
export function playerUrl(videoUrl: string, startTime: number | null): string {
  if (startTime === null) return videoUrl;
  const url = new URL(videoUrl);
  url.searchParams.set('startTime', `${startTime}s`);
  url.searchParams.set('autoplay', 'true');
  return url.toString();
}

/** `87.8` → `1:27`, as the chapter list under the video shows it. */
export function formatChapterTime(startTime: number): string {
  const seconds = Math.floor(startTime);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
