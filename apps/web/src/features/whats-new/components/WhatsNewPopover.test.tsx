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
  videoUrl: VIDEO,
  chapters: [
    { title: 'Build a Data Mart on Top of Another', startTime: 40.1 },
    { title: 'And a Few More Things', startTime: 87.8 },
  ],
};

describe('WhatsNewPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useReleaseToAnnounce).mockReturnValue({ release: RELEASE, isReady: true });
  });
  afterEach(cleanup);

  it('names the release in the title', () => {
    render(<WhatsNewPopoverTitle />);
    expect(screen.getByText("What's new in OWOX Data Marts 0.41.0")).toBeTruthy();
  });

  it('plays the video from the chapter the user picks', () => {
    const { container } = render(<WhatsNewPopoverContent />);
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(VIDEO);

    fireEvent.click(screen.getByRole('button', { name: /1:27\s*And a Few More Things/ }));

    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      `${VIDEO}?startTime=87.8s&autoplay=true`
    );
    expect(trackWhatsNewEvent).toHaveBeenCalledWith('whats_new_chapter_played', '0.41.0', {
      chapter: 'And a Few More Things',
    });
  });

  it('links to the release in the changelog', () => {
    render(<WhatsNewPopoverContent />);
    const link = screen.getByRole('link', { name: /Read the changelog/ });

    expect(link.getAttribute('href')).toMatch(/docs\.owox\.com\/docs\/changelog\/.*#0410$/);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('closes on Later', () => {
    const onClose = vi.fn();
    render(<WhatsNewPopoverContent onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(trackWhatsNewEvent).toHaveBeenCalledWith('whats_new_postponed', '0.41.0');
  });

  it('renders nothing without a release', () => {
    vi.mocked(useReleaseToAnnounce).mockReturnValue({ release: null, isReady: true });
    const { container } = render(<WhatsNewPopoverContent />);
    expect(container.innerHTML).toBe('');
  });
});
