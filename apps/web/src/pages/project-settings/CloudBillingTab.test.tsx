import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useFlags } from '../../app/store/hooks';
import { RequestStatus } from '../../shared/types/request-status';
import { CloudBillingTab } from './CloudBillingTab';

vi.mock('../../app/store/hooks', () => ({ useFlags: vi.fn() }));

function renderTab(flags: Record<string, unknown>) {
  vi.mocked(useFlags).mockReturnValue({ flags, callState: RequestStatus.LOADED });
  const renderBilling = vi.fn((origin: string) => <p>Credits from {origin}</p>);
  render(
    <MemoryRouter initialEntries={['/project-settings/credit']}>
      <Routes>
        <Route path='project-settings' element={<Outlet />}>
          <Route index element={<p>Project overview</p>} />
          <Route
            path='credit'
            element={
              <CloudBillingTab fallback={<p>Legacy billing</p>}>{renderBilling}</CloudBillingTab>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>
  );
  return renderBilling;
}

describe('CloudBillingTab', () => {
  const origin = 'https://ib.example.test';

  it('opens native billing in Cloud when the backend enables it', () => {
    renderTab({ IDP_PROVIDER: 'owox-better-auth', CLOUD_BILLING_API_ORIGIN: origin });
    expect(screen.getByText(`Credits from ${origin}`)).toBeInTheDocument();
  });

  it('preserves the Cloud fallback when the flag is off', () => {
    const renderBilling = renderTab({ IDP_PROVIDER: 'owox-better-auth' });
    expect(screen.getByText('Legacy billing')).toBeInTheDocument();
    expect(renderBilling).not.toHaveBeenCalled();
  });

  it('redirects self-hosted deep links before mounting billing', () => {
    const renderBilling = renderTab({
      IDP_PROVIDER: 'better-auth',
      CLOUD_BILLING_API_ORIGIN: origin,
    });
    expect(screen.getByText('Project overview')).toBeInTheDocument();
    expect(renderBilling).not.toHaveBeenCalled();
  });
});
