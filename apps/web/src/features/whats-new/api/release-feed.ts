import type { AnnouncedRelease, ReleaseChapter } from '../model/types';

/**
 * Published by the documentation build from the changelog: the releases whose what's-new
 * video is out, newest first.
 */
export const RELEASE_FEED_URL = 'https://docs.owox.com/docs/releases.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toChapter(value: unknown): ReleaseChapter | null {
  if (!isRecord(value)) return null;
  const { title, startTime } = value;
  if (typeof title !== 'string' || !title.trim()) return null;
  if (typeof startTime !== 'number' || !Number.isFinite(startTime) || startTime < 0) return null;
  return { title: title.trim(), startTime };
}

function toRelease(value: unknown): AnnouncedRelease | null {
  if (!isRecord(value)) return null;
  const { version, videoUrl, chapters } = value;
  if (typeof version !== 'string' || typeof videoUrl !== 'string') return null;
  if (!videoUrl.startsWith('https://')) return null;
  return {
    version,
    videoUrl,
    chapters: Array.isArray(chapters)
      ? chapters.map(toChapter).filter((chapter): chapter is ReleaseChapter => chapter !== null)
      : [],
  };
}

/** Keeps the well-formed releases of the feed and drops anything else. */
export function parseReleaseFeed(payload: unknown): AnnouncedRelease[] {
  if (!isRecord(payload) || !Array.isArray(payload.releases)) return [];
  return payload.releases
    .map(toRelease)
    .filter((release): release is AnnouncedRelease => release !== null);
}

export async function fetchReleaseFeed(): Promise<AnnouncedRelease[]> {
  const response = await fetch(RELEASE_FEED_URL, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Release feed request failed: ${response.status}`);
  return parseReleaseFeed(await response.json());
}
