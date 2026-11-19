import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/data-layer', () => ({ trackEvent }));

import { ConnectAiAssistantPromoActions } from './ConnectAiAssistantPromoActions';

const CTX = { placement: 'reports_promo', mcpPart: 'consumption', mode: 'connector' } as const;

describe('ConnectAiAssistantPromoActions', () => {
  beforeEach(() => trackEvent.mockClear());

  it.each([
    ['Claude', 'claude'],
    ['ChatGPT', 'chatgpt'],
    ['How to set up the MCP connection', 'docs'],
  ])('tracks a click on %s', (label, action) => {
    render(<ConnectAiAssistantPromoActions ctx={CTX} />);
    fireEvent.click(screen.getByRole('link', { name: label }));
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'mcp_promo_clicked',
        label: 'reports_promo',
        context: 'consumption',
        value: action,
      })
    );
  });

  it.each([
    ['project_reports_page', 'reports_list'],
    ['dm_page_destinations_tab', 'ai_assistant_card'],
    ['dm_page_destinations_tab', 'empty_state'],
  ])('keeps the exact UTM-tagged guide link for %s / %s', (medium, campaign) => {
    render(<ConnectAiAssistantPromoActions ctx={CTX} utmMedium={medium} utmCampaign={campaign} />);
    expect(
      screen.getByRole('link', { name: 'How to set up the MCP connection' }).getAttribute('href')
    ).toBe(
      `https://docs.owox.com/docs/getting-started/setup-guide/mcp/?utm_source=owox_data_marts&utm_medium=${medium}&utm_campaign=${campaign}`
    );
  });

  it('links the plain guide without UTM values', () => {
    render(<ConnectAiAssistantPromoActions ctx={CTX} />);
    expect(
      screen.getByRole('link', { name: 'How to set up the MCP connection' }).getAttribute('href')
    ).toBe('https://docs.owox.com/docs/getting-started/setup-guide/mcp/');
  });
});
