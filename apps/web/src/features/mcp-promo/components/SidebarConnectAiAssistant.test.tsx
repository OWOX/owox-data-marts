import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/data-layer', () => ({ trackEvent }));

const authMock = vi.hoisted(() => ({
  value: { user: { mcpServerUrl: 'https://mcp.example.com' } as { mcpServerUrl?: string } | null },
}));
vi.mock('../../idp', () => ({ useAuth: () => authMock.value }));

import { SidebarConnectAiAssistant } from './SidebarConnectAiAssistant';

describe('SidebarConnectAiAssistant', () => {
  beforeEach(() => {
    trackEvent.mockClear();
    authMock.value = { user: { mcpServerUrl: 'https://mcp.example.com' } };
  });

  it('renders the row label', () => {
    render(<SidebarConnectAiAssistant />);
    expect(screen.getByText('Connect AI assistant')).toBeTruthy();
  });

  it('renders nothing without an MCP server url', () => {
    authMock.value = { user: {} };
    const { container } = render(<SidebarConnectAiAssistant />);
    expect(container.innerHTML).toBe('');
  });

  it('opens the handoff on click and tracks shown once, only after opening', () => {
    render(<SidebarConnectAiAssistant />);
    expect(screen.queryByText('Add to Claude')).toBeNull();
    expect(trackEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Connect AI assistant/ }));

    expect(screen.getByText('Add to Claude')).toBeTruthy();
    expect(trackEvent).toHaveBeenCalledTimes(1);
    const payload = trackEvent.mock.calls[0][0] as { details: string };
    expect(payload).toMatchObject({ event: 'mcp_promo_shown', label: 'sidebar_connect' });
    expect(JSON.parse(payload.details)).toMatchObject({
      placement: 'sidebar_connect',
      mcp_part: 'both',
      mode: 'connector',
    });
  });

  it('sends shown on every popover open', () => {
    render(<SidebarConnectAiAssistant />);
    const trigger = screen.getByRole('button', { name: /Connect AI assistant/ });

    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByText('Add to Claude')).toBeNull();
    fireEvent.click(trigger);

    expect(screen.getByText('Add to Claude')).toBeTruthy();
    expect(trackEvent.mock.calls.filter(([p]) => p.event === 'mcp_promo_shown')).toHaveLength(2);
  });
});
