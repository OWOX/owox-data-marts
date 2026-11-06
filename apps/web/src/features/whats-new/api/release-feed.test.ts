import { describe, expect, it } from 'vitest';
import { parseReleaseFeed } from './release-feed';
import { changelogUrl, formatChapterTime, playerUrl } from '../model/links';

const VIDEO = 'https://customer-x.cloudflarestream.com/abc/iframe';

describe('parseReleaseFeed', () => {
  it('keeps well-formed releases and chapters', () => {
    expect(
      parseReleaseFeed({
        releases: [
          {
            version: '0.41.0',
            videoUrl: VIDEO,
            chapters: [
              { title: ' Build a Data Mart on Top of Another ', startTime: 40.1 },
              { title: '', startTime: 3 },
              { title: 'Negative', startTime: -1 },
            ],
          },
        ],
      })
    ).toEqual([
      {
        version: '0.41.0',
        videoUrl: VIDEO,
        chapters: [{ title: 'Build a Data Mart on Top of Another', startTime: 40.1 }],
      },
    ]);
  });

  it('drops releases without a version or an https video', () => {
    expect(
      parseReleaseFeed({
        releases: [
          { videoUrl: VIDEO },
          { version: '0.40.0', videoUrl: 'javascript:alert(1)' },
          null,
        ],
      })
    ).toEqual([]);
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
