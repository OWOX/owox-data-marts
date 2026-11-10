// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressKey } from '../../../components/AppSidebar/SetupChecklist/types';
import type { AnnouncedRelease } from '../model/types';

vi.mock('../model/hooks/useReleaseToAnnounce', () => ({ useReleaseToAnnounce: vi.fn() }));
vi.mock('../../../components/AppSidebar/SetupChecklist/useSetupProgress', () => ({
  useSetupProgress: vi.fn(),
}));
vi.mock('../../../app/store/hooks/useContentPopovers', () => ({ useContentPopovers: vi.fn() }));
vi.mock('../../idp/hooks/useAuthState', () => ({ useUser: vi.fn() }));
vi.mock('../../idp/services/auth.service', () => ({
  isViewOnlySession: (user: { viewOnly?: boolean } | null) => user?.viewOnly === true,
}));
vi.mock('../model/whats-new.analytics', () => ({ trackWhatsNewEvent: vi.fn() }));

const { useReleaseToAnnounce } = await import('../model/hooks/useReleaseToAnnounce');
const { useSetupProgress } =
  await import('../../../components/AppSidebar/SetupChecklist/useSetupProgress');
const { useContentPopovers } = await import('../../../app/store/hooks/useContentPopovers');
const { useUser } = await import('../../idp/hooks/useAuthState');
const { trackWhatsNewEvent } = await import('../model/whats-new.analytics');
const { WhatsNewAnnouncer } = await import('./WhatsNewAnnouncer');

const STORAGE_KEY = 'whats-new-last-seen-release:user-1';
const RELEASE: AnnouncedRelease = {
  version: '0.41.0',
  videoUrl: 'https://customer-x.cloudflarestream.com/abc/iframe',
  chapters: [],
};

const open = vi.fn();

function setup({
  release = RELEASE as AnnouncedRelease | null,
  isReady = true,
  hasDataMart = true,
  setupLoading = false,
  otherPopoverOpen = false,
  viewOnly = false,
} = {}) {
  vi.mocked(useReleaseToAnnounce).mockReturnValue({ release, isReady });
  vi.mocked(useSetupProgress).mockReturnValue({
    progress: {
      [ProgressKey.HAS_DRAFT_DATA_MART]: { done: hasDataMart, completedAt: null },
      [ProgressKey.HAS_PUBLISHED_DATA_MART]: { done: false, completedAt: null },
    },
    isLoading: setupLoading,
  } as unknown as ReturnType<typeof useSetupProgress>);
  vi.mocked(useContentPopovers).mockReturnValue({
    isOpen: otherPopoverOpen,
    open,
  } as unknown as ReturnType<typeof useContentPopovers>);
  vi.mocked(useUser).mockReturnValue({ id: 'user-1', projectId: 'p-1', viewOnly } as ReturnType<
    typeof useUser
  >);
}

describe('WhatsNewAnnouncer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('opens the popover for a release newer than the one last seen', () => {
    localStorage.setItem(STORAGE_KEY, '0.40.0');
    setup();
    render(<WhatsNewAnnouncer />);

    expect(open).toHaveBeenCalledWith('whats-new');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('0.41.0');
    expect(trackWhatsNewEvent).toHaveBeenCalledWith('whats_new_shown', '0.41.0');
  });

  it('opens the popover for a returning user seen for the first time in this browser', () => {
    setup({ hasDataMart: true });
    render(<WhatsNewAnnouncer />);

    expect(open).toHaveBeenCalledOnce();
  });

  it('waits until a new user has a Data Mart, storing nothing meanwhile', () => {
    setup({ hasDataMart: false });
    render(<WhatsNewAnnouncer />);

    expect(open).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('stays closed for a release already seen', () => {
    localStorage.setItem(STORAGE_KEY, '0.41.0');
    setup();
    render(<WhatsNewAnnouncer />);

    expect(open).not.toHaveBeenCalled();
  });

  it('stays closed in a view-only session and remembers nothing', () => {
    setup({ viewOnly: true });
    render(<WhatsNewAnnouncer />);

    expect(open).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not replace another open popover and leaves the release for the next load', () => {
    localStorage.setItem(STORAGE_KEY, '0.40.0');
    setup({ otherPopoverOpen: true });
    const { rerender } = render(<WhatsNewAnnouncer />);
    setup({ otherPopoverOpen: false });
    rerender(<WhatsNewAnnouncer />);

    expect(open).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('0.40.0');
  });

  it('waits for the feed and the setup progress before deciding', () => {
    localStorage.setItem(STORAGE_KEY, '0.40.0');
    setup({ isReady: false, release: null });
    const { rerender } = render(<WhatsNewAnnouncer />);
    setup({ setupLoading: true });
    rerender(<WhatsNewAnnouncer />);
    expect(open).not.toHaveBeenCalled();

    setup();
    rerender(<WhatsNewAnnouncer />);
    expect(open).toHaveBeenCalledOnce();
  });
});
