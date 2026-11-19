import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../utils/data-layer', () => ({ trackEvent }));

const authMock = vi.hoisted(() => ({
  value: { user: {} as { mcpServerUrl?: string } | null },
}));
const roleMock = vi.hoisted(() => ({ canEdit: true }));
vi.mock('../idp', () => ({ useAuth: () => authMock.value, useRole: () => roleMock }));

import { useIsMcpPromoAvailable, useIsMcpSetupPromoAvailable, useMcpPromoShown } from './hooks';

const ctx = { placement: 'overview_card', mcpPart: 'consumption', mode: 'prompt' } as const;

describe('useMcpPromoShown', () => {
  beforeEach(() => trackEvent.mockClear());

  it('does not fire while hidden', () => {
    renderHook(() => {
      useMcpPromoShown(ctx, false);
    });
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('fires once per mount when visible first becomes true', () => {
    const { rerender } = renderHook(
      ({ visible }) => {
        useMcpPromoShown(ctx, visible);
      },
      {
        initialProps: { visible: false },
      }
    );
    rerender({ visible: true });
    rerender({ visible: false });
    rerender({ visible: true });
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});

describe('useIsMcpPromoAvailable', () => {
  it('is false without an MCP server url', () => {
    authMock.value = { user: {} };
    expect(renderHook(() => useIsMcpPromoAvailable()).result.current).toBe(false);
  });

  it('is true with an MCP server url', () => {
    authMock.value = { user: { mcpServerUrl: 'https://mcp.owox.com/mcp' } };
    expect(renderHook(() => useIsMcpPromoAvailable()).result.current).toBe(true);
  });
});

describe('useIsMcpSetupPromoAvailable', () => {
  it.each([
    [true, true, true],
    [true, false, false],
    [false, true, false],
  ])('with an MCP server url %s and canEdit %s is %s', (hasUrl, canEdit, expected) => {
    authMock.value = { user: hasUrl ? { mcpServerUrl: 'https://mcp.owox.com/mcp' } : {} };
    roleMock.canEdit = canEdit;
    expect(renderHook(() => useIsMcpSetupPromoAvailable()).result.current).toBe(expected);
  });
});
