// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PromoStep, useDataMartNextStepPromo } from '../useDataMartNextStepPromo';

const toast = vi.hoisted(() => Object.assign(vi.fn(), { dismiss: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('../../../../mcp-promo', () => ({
  AiAssistantHandoff: () => null,
  buildMcpPrompt: () => 'prompt',
}));

describe('useDataMartNextStepPromo', () => {
  // Sonner merges the options of a toast id; a replacement must reset the setup toast width.
  it.each([PromoStep.SCHEDULE_DATA, PromoStep.USE_DATA])(
    'resets the setup toast style when %s replaces it',
    step => {
      toast.mockClear();
      const { result } = renderHook(() => useDataMartNextStepPromo(), { wrapper: MemoryRouter });
      const args = { projectId: 'p', dataMartId: `dm-${step}` };

      act(() => {
        result.current.showPromo({ ...args, step: PromoStep.SETUP_DATA });
        result.current.showPromo({ ...args, step });
      });

      const [setup, replacement] = toast.mock.calls.map(call => call[1] as Record<string, unknown>);
      expect(setup.style).toBeDefined();
      expect('style' in replacement && replacement.style === undefined).toBe(true);
    }
  );
});
