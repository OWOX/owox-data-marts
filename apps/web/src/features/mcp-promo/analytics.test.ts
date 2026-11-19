import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../utils/data-layer', () => ({ trackEvent }));

import { trackMcpPromoClicked, trackMcpPromoShown } from './analytics';

const ctx = { placement: 'overview_card', mcpPart: 'consumption', mode: 'prompt' } as const;

describe('mcp promo analytics', () => {
  beforeEach(() => trackEvent.mockClear());

  it('tracks a shown event without an action', () => {
    trackMcpPromoShown(ctx);
    expect(trackEvent).toHaveBeenCalledWith({
      event: 'mcp_promo_shown',
      category: 'McpPromo',
      action: 'Shown',
      label: 'overview_card',
      context: 'consumption',
      value: null,
      error: null,
      details: JSON.stringify({
        surface: 'web_app',
        placement: 'overview_card',
        mcp_part: 'consumption',
        mode: 'prompt',
      }),
    });
  });

  it('tracks a clicked event with the action', () => {
    trackMcpPromoClicked({ ...ctx, action: 'copy' });
    const payload = trackEvent.mock.calls[0][0];
    expect(payload).toMatchObject({
      event: 'mcp_promo_clicked',
      action: 'Clicked',
      value: 'copy',
    });
    expect(payload.details).toContain('"action":"copy"');
    expect(payload.details).toContain('"surface":"web_app"');
  });
});
