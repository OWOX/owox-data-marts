// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isAnalyticsDisabled,
  pushToDataLayer,
  setAnalyticsDisabled,
  suppressClientAnalytics,
  trackEvent,
  trackLogout,
  trackUserIdentified,
} from './data-layer';

describe('data-layer analytics gate', () => {
  beforeEach(() => {
    setAnalyticsDisabled(false);
    window.dataLayer = { push: vi.fn() } as unknown as typeof window.dataLayer;
  });

  afterEach(() => {
    setAnalyticsDisabled(false);
    vi.restoreAllMocks();
  });

  it('pushes events when analytics are enabled', () => {
    trackEvent({ event: 'test_event', category: 'Test', action: 'Click' });

    expect(window.dataLayer?.push).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'test_event',
        category: 'Test',
        action: 'Click',
        eventType: 'app',
      })
    );
  });

  it('does not push trackEvent / identify / logout when analytics are disabled', () => {
    setAnalyticsDisabled(true);

    trackEvent({ event: 'should_not_fire' });
    trackUserIdentified({ userId: 'u1', userEmail: 'a@b.c' });
    trackLogout();
    pushToDataLayer({ projectId: 'p1' });

    expect(window.dataLayer?.push).not.toHaveBeenCalled();
    expect(isAnalyticsDisabled()).toBe(true);
  });

  it('suppressClientAnalytics disables dataLayer pushes', () => {
    suppressClientAnalytics();
    trackEvent({ event: 'blocked' });

    expect(isAnalyticsDisabled()).toBe(true);
    expect(window.dataLayer?.push).not.toHaveBeenCalled();
  });

  it('re-enables pushes after setAnalyticsDisabled(false)', () => {
    setAnalyticsDisabled(true);
    trackEvent({ event: 'blocked' });
    expect(window.dataLayer?.push).not.toHaveBeenCalled();

    setAnalyticsDisabled(false);
    trackEvent({ event: 'allowed' });
    expect(window.dataLayer?.push).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'allowed' })
    );
  });
});
