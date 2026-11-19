import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../../../../utils/data-layer', () => ({ trackEvent }));
vi.mock('../../../../../idp', () => ({ useAuth: () => ({ user: {} }) }));
vi.mock('../../../../../../shared/hooks', () => ({
  useProjectRoute: () => ({ scope: (p: string) => p }),
  useAutoAdvanceTabs: (tabs: string[]) => {
    const [value, setValue] = useState(tabs[0]);
    return {
      value,
      onValueChange: setValue,
      pauseHandlers: {},
      isAutoPlaying: false,
      intervalMs: 6000,
    };
  },
}));

import { EmptyDataMartDestinationsState } from './EmptyDataMartDestinationsState';

const shown = () => trackEvent.mock.calls.filter(([e]) => e.event === 'mcp_promo_shown');

describe('EmptyDataMartDestinationsState', () => {
  beforeEach(() => {
    trackEvent.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends shown only once the mcp tab is displayed, and tracks clicks', () => {
    render(
      <MemoryRouter>
        <EmptyDataMartDestinationsState variant='promo' />
      </MemoryRouter>
    );
    expect(shown()).toHaveLength(0);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'AI assistants' }));
    fireEvent.click(screen.getByRole('tab', { name: 'AI assistants' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(shown()).toHaveLength(1);
    expect(shown()[0][0]).toMatchObject({ label: 'destinations_empty_tab' });
    fireEvent.click(screen.getByRole('link', { name: 'Claude' }));
    expect(trackEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: 'mcp_promo_clicked',
        label: 'destinations_empty_tab',
        value: 'claude',
      })
    );
    // The setup guide link and the invite row icon share one href; only the icon link is ours.
    const sameHref = Array.from(
      document.querySelectorAll(
        'a[href*="utm_medium=dm_page_destinations_tab"][href*="/setup-guide/mcp/"]'
      )
    );
    expect(sameHref).toHaveLength(2);
    const iconLink = sameHref.find(a => !a.textContent.trim());
    expect(iconLink).toBeDefined();
    trackEvent.mockClear();
    fireEvent.click(iconLink!);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'mcp_promo_clicked',
        label: 'destinations_empty_tab',
        value: 'docs',
      })
    );
  });
});
