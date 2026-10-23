import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Toaster } from 'sonner';
import { afterEach, describe, expect, it } from 'vitest';
import { PromoStep, useDataMartNextStepPromo } from '../useDataMartNextStepPromo';
import { storageService } from '../../../../../services';

describe('Data Mart setup promo', () => {
  const hook = () => renderHook(() => useDataMartNextStepPromo());
  let dismissPromos: (() => void) | undefined;

  afterEach(() => {
    act(() => dismissPromos?.());
    storageService.remove('promo_shown_once_use_data');
  });

  it('renders both assistants with the existing draft context and deduplicates the promo', async () => {
    const { result } = hook();
    dismissPromos = result.current.dismissAllPromos;
    render(
      <MemoryRouter>
        <Toaster />
      </MemoryRouter>
    );
    const options = {
      step: PromoStep.SETUP_DATA,
      projectId: 'project-toast',
      dataMartId: 'mart-toast',
      mcpServerUrl: 'https://project-toast.mcp.owox.com/mcp',
    };

    act(() => {
      result.current.showPromo(options);
      result.current.showPromo(options);
    });

    expect(await screen.findByText('You can continue setup with an AI assistant')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'ChatGPT' })).toHaveLength(1);
    for (const name of ['ChatGPT', 'Claude']) {
      fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });
      const link = await screen.findByRole('menuitem', { name: 'Open in browser' });
      const prompt = new URL(link.getAttribute('href')!).searchParams.get('q');
      expect(prompt).toContain('Project ID: project-toast');
      expect(prompt).toContain('Data Mart ID: mart-toast');
      expect(prompt).toContain('https://project-toast.mcp.owox.com/mcp');
      fireEvent.keyDown(link, { key: 'Escape' });
    }
    expect(screen.getByRole('button', { name: 'Copy prompt' })).toBeVisible();
  });

  it('replaces the draft setup promo with the existing publication promo', async () => {
    const { result } = hook();
    dismissPromos = result.current.dismissAllPromos;
    render(
      <MemoryRouter>
        <Toaster />
      </MemoryRouter>
    );
    act(() => {
      result.current.showPromo({
        step: PromoStep.SETUP_DATA,
        projectId: 'project-publish',
        dataMartId: 'mart-publish',
      });
    });
    expect(await screen.findByText('You can continue setup with an AI assistant')).toBeVisible();

    act(() => {
      result.current.showPromo({
        step: PromoStep.USE_DATA,
        projectId: 'project-publish',
        dataMartId: 'mart-publish',
        showOnce: true,
      });
    });

    expect(await screen.findByText('Enable your data')).toBeVisible();
    expect(
      screen.queryByText('You can continue setup with an AI assistant')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create Report…' })).toHaveAttribute(
      'href',
      '/ui/project-publish/data-marts/mart-publish/reports'
    );
  });

  it('dismisses a stale draft promo even when the publication promo was already shown globally', async () => {
    storageService.set('promo_shown_once_use_data', true);
    const { result } = hook();
    dismissPromos = result.current.dismissAllPromos;
    render(
      <MemoryRouter>
        <Toaster />
      </MemoryRouter>
    );
    act(() => {
      result.current.showPromo({
        step: PromoStep.SETUP_DATA,
        projectId: 'project-seen',
        dataMartId: 'mart-seen',
      });
    });
    expect(await screen.findByText('You can continue setup with an AI assistant')).toBeVisible();

    act(() => {
      result.current.showPromo({
        step: PromoStep.USE_DATA,
        projectId: 'project-seen',
        dataMartId: 'mart-seen',
        showOnce: true,
      });
    });

    await waitFor(() => {
      expect(
        screen.queryByText('You can continue setup with an AI assistant')
      ).not.toBeInTheDocument();
    });
    expect(screen.queryByText('Enable your data')).not.toBeInTheDocument();
  });
});
