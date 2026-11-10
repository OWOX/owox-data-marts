/** A scene of the release video: where it starts and what it shows. */
export interface ReleaseChapter {
  title: string;
  /** Seconds from the start of the video. */
  startTime: number;
  /** The time as the changelog shows it, e.g. `0:39`. */
  label?: string;
}

/** A release whose what's-new video is published in the changelog. */
export interface AnnouncedRelease {
  version: string;
  /** Cloudflare Stream player URL of the release video. */
  videoUrl: string;
  chapters: ReleaseChapter[];
}
