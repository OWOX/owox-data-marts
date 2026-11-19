import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../../../../utils/data-layer', () => ({ trackEvent }));
vi.mock('../../../../../idp', () => ({ useAuth: () => ({ user: {} }) }));

import { AiAssistantDestinationCard } from './AiAssistantDestinationCard';

const shown = () => trackEvent.mock.calls.filter(([e]) => e.event === 'mcp_promo_shown');

describe('AiAssistantDestinationCard', () => {
  beforeEach(() => {
    trackEvent.mockClear();
    localStorage.clear();
  });

  it('sends shown when expanded', () => {
    render(<AiAssistantDestinationCard dataMartId='dm1' />);
    expect(screen.getByText('AI Assistants')).toBeTruthy();
    expect(shown()).toHaveLength(1);
    expect(shown()[0][0]).toMatchObject({ label: 'destinations_tab_card' });
  });

  it('sends no shown when collapsed', () => {
    localStorage.setItem('collapsed-card-ai-assistant-destination-card-dm1', 'true');
    render(<AiAssistantDestinationCard dataMartId='dm1' />);
    expect(shown()).toHaveLength(0);
  });
});
