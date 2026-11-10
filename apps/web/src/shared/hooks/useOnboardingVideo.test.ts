// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../app/store/hooks/useContentPopovers', () => ({ useContentPopovers: vi.fn() }));

const { useContentPopovers } = await import('../../app/store/hooks/useContentPopovers');
const { useOnboardingVideo } = await import('./useOnboardingVideo');

const open = vi.fn();
const params = { storageKey: 'onboarding-video-shown', popoverId: 'video-1', shouldShow: true };

function popovers(isOpen: boolean) {
  vi.mocked(useContentPopovers).mockReturnValue({
    isOpen,
    open,
  } as unknown as ReturnType<typeof useContentPopovers>);
}

describe('useOnboardingVideo', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('opens the video once', () => {
    popovers(false);
    const { rerender } = renderHook(() => {
      useOnboardingVideo(params);
    });
    rerender();

    expect(open).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith('video-1');
    expect(localStorage.getItem('onboarding-video-shown')).toBe('true');
  });

  it('waits until another popover closes', () => {
    popovers(true);
    const { rerender } = renderHook(() => {
      useOnboardingVideo(params);
    });
    expect(open).not.toHaveBeenCalled();
    expect(localStorage.getItem('onboarding-video-shown')).toBeNull();

    popovers(false);
    rerender();
    expect(open).toHaveBeenCalledOnce();
  });

  it('does not open a video already shown in this browser', () => {
    localStorage.setItem('onboarding-video-shown', 'true');
    popovers(false);
    renderHook(() => {
      useOnboardingVideo(params);
    });

    expect(open).not.toHaveBeenCalled();
  });
});
