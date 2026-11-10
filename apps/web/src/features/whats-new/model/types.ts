/** A scene of the release video: where it starts and what it shows. */
export interface ReleaseChapter {
  title: string;
  /** Seconds from the start of the video. */
  startTime: number;
  /** The time as the changelog shows it, e.g. `0:39`. */
  label?: string;
}

/** A recent release, as the documentation build publishes it from the changelog. */
export interface AnnouncedRelease {
  version: string;
  /** When the release shipped, if the documentation build knew it. */
  releasedAt: string | null;
  /** Cloudflare Stream player URL of the release video, once it is published. */
  videoUrl: string | null;
  chapters: ReleaseChapter[];
  /** Titles of the release's changes, as in the changelog. */
  changes: string[];
}
