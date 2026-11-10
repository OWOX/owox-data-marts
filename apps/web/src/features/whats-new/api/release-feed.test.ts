import { describe, expect, it } from 'vitest';
import { parseReleaseFeed } from './release-feed';
import { changelogUrl, formatChapterTime, playerUrl } from '../model/links';

const VIDEO = 'https://customer-4geatlj66rtkaxtz.cloudflarestream.com/d7dde8721ec80ac8/iframe';

describe('parseReleaseFeed', () => {
  it('keeps well-formed releases, chapters and changes', () => {
    expect(
      parseReleaseFeed({
        releases: [
          {
            version: '0.41.0',
            releasedAt: '2026-11-02T14:23:04.000Z',
            videoUrl: VIDEO,
            chapters: [
              {
                title: ' Build a Data Mart on Top of Another ',
                startTime: 40.1,
                label: '0:39',
              },
              { title: 'No label', startTime: 87.8 },
              { title: 'Odd label', startTime: 90, label: 'soon' },
              { title: '', startTime: 3 },
              { title: 'Negative', startTime: -1 },
            ],
            changes: [' Safer sign-in ', '', 42],
          },
        ],
      })
    ).toEqual([
      {
        version: '0.41.0',
        releasedAt: '2026-11-02T14:23:04.000Z',
        videoUrl: VIDEO,
        chapters: [
          { title: 'Build a Data Mart on Top of Another', startTime: 40.1, label: '0:39' },
          { title: 'No label', startTime: 87.8 },
          { title: 'Odd label', startTime: 90 },
        ],
        changes: ['Safer sign-in'],
      },
    ]);
  });

  it('keeps a release without a video and drops chapters it cannot play', () => {
    expect(
      parseReleaseFeed({
        releases: [
          {
            version: '0.42.0',
            releasedAt: '2026-11-05T16:22:43.000Z',
            videoUrl: null,
            chapters: [{ title: 'Orphan', startTime: 1 }],
            changes: ['Count unique records'],
          },
        ],
      })
    ).toEqual([
      {
        version: '0.42.0',
        releasedAt: '2026-11-05T16:22:43.000Z',
        videoUrl: null,
        chapters: [],
        changes: ['Count unique records'],
      },
    ]);
  });

  it('accepts only a Cloudflare Stream player as the video', () => {
    const videos = parseReleaseFeed({
      releases: [
        { version: '0.40.0', videoUrl: 'javascript:alert(1)' },
        { version: '0.39.0', videoUrl: 'https://example.com/d7dde8721ec80ac8/iframe' },
        { version: '0.38.0', videoUrl: `${VIDEO}?autoplay=true` },
      ],
    }).map(release => release.videoUrl);

    expect(videos).toEqual([null, null, null]);
  });

  it('drops a release without a release version', () => {
    expect(
      parseReleaseFeed({ releases: [{ videoUrl: VIDEO }, { version: 'latest' }, null] })
    ).toEqual([]);
  });

  it('treats a malformed date, chapter list or change list as missing', () => {
    expect(
      parseReleaseFeed({
        releases: [
          { version: '0.39.0', releasedAt: 'last Monday', videoUrl: VIDEO, chapters: 'none' },
        ],
      })
    ).toEqual([
      { version: '0.39.0', releasedAt: null, videoUrl: VIDEO, chapters: [], changes: [] },
    ]);
  });

  it('returns no releases for an unexpected payload', () => {
    expect(parseReleaseFeed(null)).toEqual([]);
    expect(parseReleaseFeed({ releases: 'nope' })).toEqual([]);
  });
});

describe('links', () => {
  it('links to the release section of the changelog', () => {
    expect(changelogUrl('0.41.0')).toBe(
      'https://docs.owox.com/docs/changelog/?utm_source=owox-data-marts&utm_medium=ui&utm_campaign=whats-new-popover#0410'
    );
  });

  it('starts the video from a chapter', () => {
    expect(playerUrl(VIDEO, null)).toBe(VIDEO);
    expect(playerUrl(VIDEO, 40.1)).toBe(`${VIDEO}?startTime=40.1s&autoplay=true`);
  });

  it('formats chapter times as minutes and seconds', () => {
    expect(formatChapterTime(11.4)).toBe('0:11');
    expect(formatChapterTime(87.8)).toBe('1:27');
    expect(formatChapterTime(600)).toBe('10:00');
  });
});
