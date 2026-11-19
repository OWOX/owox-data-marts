// @vitest-environment happy-dom
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Toaster } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const trackEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../../../utils/data-layer', () => ({ trackEvent }));
vi.mock('../../../../idp', () => ({
  useAuth: () => ({ user: { mcpServerUrl: 'https://project-toast.mcp.owox.com/mcp' } }),
}));

import { PromoStep, useDataMartNextStepPromo } from '../useDataMartNextStepPromo';
import { storageService } from '../../../../../services';

const SETUP_TITLE = 'Finish this setup with your AI assistant';

describe('Data Mart setup promo', () => {
  let dismissPromos: (() => void) | undefined;

  beforeEach(() => {
    trackEvent.mockClear();
  });

  afterEach(() => {
    act(() => dismissPromos?.());
    storageService.remove('promo_shown_once_use_data');
  });

  const setup = () => {
    const { result } = renderHook(() => useDataMartNextStepPromo());
    dismissPromos = result.current.dismissAllPromos;
    render(
      <MemoryRouter>
        <Toaster />
      </MemoryRouter>
    );
    return result;
  };

  it('shows one AI assistant toast with the Data Mart id in the prompt', async () => {
    const result = setup();
    const options = {
      step: PromoStep.SETUP_DATA,
      projectId: 'project-toast',
      dataMartId: 'mart-toast',
    };

    act(() => {
      result.current.showPromo(options);
      result.current.showPromo(options);
    });

    expect(await screen.findByText(SETUP_TITLE)).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Open in Claude' })).toHaveLength(1);
    const href = screen.getByRole('link', { name: 'Open in ChatGPT' }).getAttribute('href') ?? '';
    const prompt = new URL(href).searchParams.get('q');
    expect(prompt).toContain('Data Mart mart-toast');
    expect(prompt).toContain('project project-toast');
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeVisible();
  });

  it('reports the toast placement as shown and tracks the Claude click', async () => {
    const result = setup();
    act(() => {
      result.current.showPromo({
        step: PromoStep.SETUP_DATA,
        projectId: 'project-track',
        dataMartId: 'mart-track',
      });
    });
    await screen.findByText(SETUP_TITLE);

    const shown = trackEvent.mock.calls.filter(([p]) => p.event === 'mcp_promo_shown');
    expect(shown).toHaveLength(1);
    expect(shown[0][0]).toMatchObject({ label: 'data_setup_toast', context: 'setup' });

    const link = screen.getByRole('link', { name: 'Open in Claude' });
    link.addEventListener('click', e => {
      e.preventDefault();
    });
    fireEvent.click(link);
    expect(trackEvent.mock.calls.at(-1)?.[0]).toMatchObject({
      event: 'mcp_promo_clicked',
      label: 'data_setup_toast',
      value: 'claude',
    });
  });

  it('replaces the draft setup promo with the publication promo', async () => {
    const result = setup();
    act(() => {
      result.current.showPromo({
        step: PromoStep.SETUP_DATA,
        projectId: 'project-publish',
        dataMartId: 'mart-publish',
      });
    });
    expect(await screen.findByText(SETUP_TITLE)).toBeVisible();

    act(() => {
      result.current.showPromo({
        step: PromoStep.USE_DATA,
        projectId: 'project-publish',
        dataMartId: 'mart-publish',
        showOnce: true,
      });
    });

    expect(await screen.findByText('Enable your data')).toBeVisible();
    expect(screen.queryByText(SETUP_TITLE)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Report…' })).toHaveAttribute(
      'href',
      '/ui/project-publish/data-marts/mart-publish/reports'
    );
  });

  it('dismisses a stale draft promo when the publication promo was already shown globally', async () => {
    storageService.set('promo_shown_once_use_data', true);
    const result = setup();
    act(() => {
      result.current.showPromo({
        step: PromoStep.SETUP_DATA,
        projectId: 'project-seen',
        dataMartId: 'mart-seen',
      });
    });
    expect(await screen.findByText(SETUP_TITLE)).toBeVisible();

    act(() => {
      result.current.showPromo({
        step: PromoStep.USE_DATA,
        projectId: 'project-seen',
        dataMartId: 'mart-seen',
        showOnce: true,
      });
    });

    await waitFor(() => {
      expect(screen.queryByText(SETUP_TITLE)).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Enable your data')).not.toBeInTheDocument();
  });
});
