// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnouncedRelease } from '../model/types';

vi.mock('../model/hooks/useReleaseToAnnounce', () => ({ useReleaseToAnnounce: vi.fn() }));
vi.mock('../model/whats-new.analytics', () => ({ trackWhatsNewEvent: vi.fn() }));

const { useReleaseToAnnounce } = await import('../model/hooks/useReleaseToAnnounce');
const { trackWhatsNewEvent } = await import('../model/whats-new.analytics');
const { WhatsNewPopoverContent, WhatsNewPopoverTitle } = await import('./WhatsNewPopover');

const VIDEO = 'https://customer-x.cloudflarestream.com/abc/iframe';
const RELEASE: AnnouncedRelease = {
  version: '0.41.0',
  releasedAt: '2026-11-02T14:23:04.000Z',
  videoUrl: VIDEO,
  chapters: [
    { title: 'Build a Data Mart on Top of Another', startTime: 40.1, label: '0:39' },
    { title: 'And a Few More Things', startTime: 87.8 },
  ],
  changes: ['Safer sign-in', 'Dates from Google Sheets arrive as dates'],
};
const CHANGES = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];

const chapter = (name: RegExp) => screen.getByRole('button', { name });

const PLAY = { __privateUnstableMessageType: 'event', eventName: 'play' };
/** happy-dom loads no iframe page, so each player gets a window of its own to post from. */
function playerWindow(container: HTMLElement): Window {
  const player = container.querySelector('iframe');
  if (!player) throw new Error('No player');
  if (player.contentWindow) return player.contentWindow;
  const ownWindow = {} as Window;
  Object.defineProperty(player, 'contentWindow', { value: ownWindow });
  return ownWindow;
}

function postFromPlayer(container: HTMLElement, init: MessageEventInit = {}) {
  const player = playerWindow(container);
  window.dispatchEvent(
    new MessageEvent('message', {
      data: PLAY,
      origin: 'https://customer-x.cloudflarestream.com',
      source: player,
      ...init,
    })
  );
}
const videoPlays = () =>
  vi.mocked(trackWhatsNewEvent).mock.calls.filter(([event]) => event === 'whats_new_video_played');

describe('WhatsNewPopover', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(useReleaseToAnnounce).mockReturnValue({ release: RELEASE, isReady: true });
  });
  afterEach(cleanup);

  it('names the release in the title', () => {
    render(<WhatsNewPopoverTitle />);
    expect(screen.getByText("What's new in OWOX Data Marts 0.41.0")).toBeTruthy();
  });

  it("shows the changelog's chapter times, or the start time without one", () => {
    render(<WhatsNewPopoverContent />);
    expect(chapter(/0:39\s*Build a Data Mart on Top of Another/)).toBeTruthy();
    expect(chapter(/1:27\s*And a Few More Things/)).toBeTruthy();
  });

  it('plays the video from the chapter the user picks', () => {
    const { container } = render(<WhatsNewPopoverContent />);
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(VIDEO);

    fireEvent.click(chapter(/And a Few More Things/));

    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      `${VIDEO}?startTime=87.8s&autoplay=true`
    );
    expect(chapter(/And a Few More Things/).getAttribute('aria-current')).toBe('true');
    expect(chapter(/Build a Data Mart/).getAttribute('aria-current')).toBeNull();
    expect(trackWhatsNewEvent).toHaveBeenCalledWith('whats_new_chapter_played', '0.41.0', {
      chapter: 'And a Few More Things',
    });
  });

  it('restarts the chapter when it is picked again', () => {
    const { container } = render(<WhatsNewPopoverContent />);
    fireEvent.click(chapter(/And a Few More Things/));
    const firstPlayer = container.querySelector('iframe');

    fireEvent.click(chapter(/And a Few More Things/));

    expect(container.querySelector('iframe')).not.toBe(firstPlayer);
  });

  it('reports the first start of the video, not every resume', () => {
    const { container } = render(<WhatsNewPopoverContent />);

    postFromPlayer(container);
    postFromPlayer(container);

    expect(videoPlays()).toEqual([['whats_new_video_played', '0.41.0', { chapter: null }]]);
  });

  it('reports a start from the picked chapter', () => {
    const { container } = render(<WhatsNewPopoverContent />);
    postFromPlayer(container);
    fireEvent.click(chapter(/And a Few More Things/));

    postFromPlayer(container);

    expect(videoPlays()).toEqual([
      ['whats_new_video_played', '0.41.0', { chapter: null }],
      ['whats_new_video_played', '0.41.0', { chapter: 'And a Few More Things' }],
    ]);
  });

  it('ignores messages that are not this player starting', () => {
    const { container } = render(<WhatsNewPopoverContent />);

    postFromPlayer(container, { source: window });
    postFromPlayer(container, { origin: 'https://example.com' });
    postFromPlayer(container, { data: { ...PLAY, eventName: 'pause' } });
    postFromPlayer(container, { data: 'play' });

    expect(videoPlays()).toEqual([]);
  });

  it('links to the release in the changelog', () => {
    render(<WhatsNewPopoverContent />);
    const link = screen.getByRole('link', { name: /Read the changelog/ });

    expect(link.getAttribute('href')).toMatch(/docs\.owox\.com\/docs\/changelog\/.*#0410$/);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('offers no Later: the card closes only with its ×', () => {
    render(<WhatsNewPopoverContent />);
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
  });

  it('lists chapters, not changes, when the video has them', () => {
    render(<WhatsNewPopoverContent />);
    expect(screen.queryByRole('list', { name: 'Changes' })).toBeNull();
  });

  it('lists the changes of a release without a video', () => {
    vi.mocked(useReleaseToAnnounce).mockReturnValue({
      release: { ...RELEASE, videoUrl: null, chapters: [], changes: CHANGES },
      isReady: true,
    });
    const { container } = render(<WhatsNewPopoverContent />);

    expect(container.querySelector('iframe')).toBeNull();
    const items = screen.getAllByRole('listitem').map(item => item.textContent);
    expect(items).toEqual(['One', 'Two', 'Three', 'Four', 'Five', 'and 2 more changes']);
    expect(screen.getByRole('link', { name: /Read the changelog/ })).toBeTruthy();
  });

  it('lists the changes under a video without chapters', () => {
    vi.mocked(useReleaseToAnnounce).mockReturnValue({
      release: { ...RELEASE, chapters: [], changes: ['Only one'] },
      isReady: true,
    });
    const { container } = render(<WhatsNewPopoverContent />);

    expect(container.querySelector('iframe')).not.toBeNull();
    expect(screen.getAllByRole('listitem').map(item => item.textContent)).toEqual(['Only one']);
  });

  it('renders nothing without a release', () => {
    vi.mocked(useReleaseToAnnounce).mockReturnValue({ release: null, isReady: true });
    const { container } = render(<WhatsNewPopoverContent />);
    expect(container.innerHTML).toBe('');
  });
});
