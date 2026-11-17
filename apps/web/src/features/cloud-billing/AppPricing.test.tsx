import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '../../app/api/apiClient';
import { AppPricing } from './AppPricing';
import type { PricingPlan } from './app-pricing';

vi.mock('../../app/api/apiClient', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../app/api/token-provider', () => ({
  getTokenProvider: () => ({ getProjectId: () => 'project-1', getUserId: () => 'user-1' }),
}));
vi.mock('../idp/hooks/useAuthState', () => ({
  useUser: () => ({ id: 'user-1', projectId: 'project-1', email: 'billing@example.test' }),
}));
vi.mock('../idp/hooks/useRole', () => ({ useCanEdit: () => true }));
vi.mock('../../shared/hooks/useProjectId', () => ({ useProjectId: () => 'project-1' }));

const plans: PricingPlan[] = [
  {
    productId: 'prod_individual',
    internalName: 'individual_2026_10',
    name: 'Individual',
    offers: [
      {
        priceId: 'price_individual',
        billingCycle: 'yearly',
        billingPeriodMonths: 12,
        currency: 'usd',
        amountMinor: 318600,
        creditsPerMonth: 150,
        seats: 2,
      },
    ],
  },
];
const invoiceUrl = 'https://invoice.stripe.com/i/example';

async function requestCheckout(recoveryUrl: string | null) {
  vi.mocked(apiClient.get).mockImplementation((url: string) =>
    Promise.resolve({ data: url.endsWith('app-pricing') ? plans : { planType: 'FREE' } })
  );
  vi.mocked(apiClient.post).mockResolvedValueOnce({
    status: 409,
    data: { code: 'UNPAID_SUBSCRIPTION', invoiceUrl: recoveryUrl },
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AppPricing origin='https://ib.example.test' />
      </MemoryRouter>
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Select Individual USD' }));
  return screen.findByRole('alert');
}

describe('App Pricing recovery from an unpaid subscription', () => {
  it('links to the existing Stripe invoice and stops offering a new checkout', async () => {
    expect(await requestCheckout(invoiceUrl)).toHaveTextContent(
      'Your previous subscription is unpaid'
    );
    expect(screen.getByRole('link', { name: 'Pay outstanding invoice' })).toHaveAttribute(
      'href',
      invoiceUrl
    );
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/stripe/app-checkout-sessions',
      expect.objectContaining({
        priceId: 'price_individual',
        billingAccount: 'billing@example.test',
      }),
      expect.any(Object)
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select Individual USD' })).not.toBeInTheDocument();
  });

  it.each([null, 'https://invoice.stripe.com.example.test/pay'])(
    'keeps checkout blocked when a trusted invoice link is unavailable (%s)',
    async recoveryUrl => {
      expect(await requestCheckout(recoveryUrl)).toHaveTextContent(
        'The invoice is currently unavailable'
      );
      expect(
        screen.queryByRole('link', { name: 'Pay outstanding invoice' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Select Individual USD' })
      ).not.toBeInTheDocument();
    }
  );
});
