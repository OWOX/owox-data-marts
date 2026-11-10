import { z } from 'zod';
import type { AnnouncedRelease, ReleaseChapter } from '../model/types';

/**
 * Published by the documentation build from the changelog: the releases whose what's-new
 * video is out, newest first.
 */
export const RELEASE_FEED_URL = 'https://docs.owox.com/docs/releases.json';

// The same shapes the documentation build writes (apps/docs/scripts/release-feed.mjs).
const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  videoUrl: z
    .string()
    .regex(/^https:\/\/customer-[a-z0-9]+\.cloudflarestream\.com\/[0-9a-f]+\/iframe$/),
  chapters: z.array(z.unknown()).catch([]),
});

const chapterSchema = z.object({
  title: z.string().trim().min(1),
  startTime: z.number().nonnegative(),
  label: z
    .string()
    .regex(/^\d+:\d{2}$/)
    .optional()
    .catch(undefined),
});

const feedSchema = z.object({ releases: z.array(z.unknown()) });

/** Keeps the well-formed releases and chapters of the feed and drops anything else. */
export function parseReleaseFeed(payload: unknown): AnnouncedRelease[] {
  const feed = feedSchema.safeParse(payload);
  if (!feed.success) return [];

  return feed.data.releases.flatMap(item => {
    const release = releaseSchema.safeParse(item);
    if (!release.success) return [];
    const chapters = release.data.chapters.flatMap((chapter): ReleaseChapter[] => {
      const parsed = chapterSchema.safeParse(chapter);
      return parsed.success ? [parsed.data] : [];
    });
    return [{ version: release.data.version, videoUrl: release.data.videoUrl, chapters }];
  });
}

export async function fetchReleaseFeed(): Promise<AnnouncedRelease[]> {
  const response = await fetch(RELEASE_FEED_URL, { credentials: 'omit' });
  if (!response.ok) throw new Error(`Release feed request failed: ${response.status}`);
  return parseReleaseFeed(await response.json());
}
