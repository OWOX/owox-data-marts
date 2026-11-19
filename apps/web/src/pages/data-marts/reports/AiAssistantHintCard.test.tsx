import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@owox/ui/components/tooltip';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/data-layer', () => ({ trackEvent }));
vi.mock('../../../features/idp', () => ({ useAuth: () => ({ user: {} }) }));

import { AiAssistantHintCard } from './AiAssistantHintCard';

describe('AiAssistantHintCard', () => {
  beforeEach(() => trackEvent.mockClear());

  it('sends shown once and docs clicks for both links', () => {
    render(
      <TooltipProvider>
        <AiAssistantHintCard />
      </TooltipProvider>
    );
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: 'mcp_promo_shown', label: 'reports_hint' })
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        'href',
        'https://docs.owox.com/docs/getting-started/setup-guide/mcp/?utm_source=owox_data_marts&utm_medium=reports_hint&utm_campaign=mcp_promo'
      );
    }
    fireEvent.click(screen.getByText('Ask your data in Claude or ChatGPT'));
    fireEvent.click(screen.getByLabelText('MCP setup guide'));
    const clicks = trackEvent.mock.calls.filter(([e]) => e.event === 'mcp_promo_clicked');
    expect(clicks).toHaveLength(2);
    for (const [e] of clicks) {
      expect(e).toMatchObject({ label: 'reports_hint', context: 'consumption', value: 'docs' });
    }
  });
});
