import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/data-layer', () => ({ trackEvent }));
vi.mock('../../../features/idp', () => ({ useAuth: () => ({ user: {} }) }));

import { ConnectAiAssistantAction } from './ConnectAiAssistantAction';

describe('ConnectAiAssistantAction', () => {
  beforeEach(() => trackEvent.mockClear());

  it('sends shown, tracks clicks and closes the popover on the buttons only', () => {
    const onClick = vi.fn();
    render(<ConnectAiAssistantAction onClick={onClick} />);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'mcp_promo_shown',
        label: 'setup_checklist',
        context: 'both',
      })
    );
    fireEvent.click(screen.getByRole('link', { name: 'Claude' }));
    fireEvent.click(screen.getByRole('link', { name: 'ChatGPT' }));
    const guide = screen.getByRole('link', { name: 'How to set up the MCP connection' });
    expect(guide).toHaveAttribute(
      'href',
      'https://docs.owox.com/docs/getting-started/setup-guide/mcp/?utm_source=owox_data_marts&utm_medium=setup_checklist&utm_campaign=mcp_promo'
    );
    fireEvent.click(guide);
    const values = trackEvent.mock.calls
      .filter(([e]) => e.event === 'mcp_promo_clicked')
      .map(([e]) => e.value);
    expect(values).toEqual(['claude', 'chatgpt', 'docs']);
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
