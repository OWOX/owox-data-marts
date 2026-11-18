import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '../../app/api/apiClient';
import { AppPricing } from './AppPricing';
import type { PricingPlan } from './app-pricing';
import type { SubscriptionDetails } from './cloud-billing';

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
        priceId: 'price_individual_monthly',
        billingCycle: 'monthly',
        billingPeriodMonths: 1,
        currency: 'usd',
        amountMinor: 29500,
        creditsPerMonth: 150,
        seats: 2,
      },
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
const catalogWithTeam = [
  ...plans,
  {
    ...plans[0],
    name: 'Team',
    productId: 'prod_team',
    internalName: 'team_2026_10',
    offers: plans[0].offers.map(offer => ({
      ...offer,
      priceId: `price_team_${offer.billingCycle}`,
    })),
  },
];
const invoiceUrl = 'https://invoice.stripe.com/i/example';

function renderPricing(
  catalog = plans,
  route = '/',
  subscription: Pick<SubscriptionDetails, 'name' | 'planType'> = {
    name: 'Free',
    planType: 'FREE',
  }
) {
  vi.mocked(apiClient.get).mockImplementation((url: string) =>
    Promise.resolve({ data: url.endsWith('app-pricing') ? catalog : subscription })
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <AppPricing origin='https://ib.example.test' />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function requestCheckout(
  recoveryUrl: string | null,
  {
    catalog = plans,
    selection = 'Individual',
    previousProductId = 'prod_individual',
  }: { catalog?: PricingPlan[]; selection?: string; previousProductId?: string | null } = {}
) {
  vi.mocked(apiClient.post).mockResolvedValueOnce({
    status: 409,
    data: { code: 'UNPAID_SUBSCRIPTION', invoiceUrl: recoveryUrl, previousProductId },
  });
  renderPricing(catalog);
  fireEvent.click(await screen.findByRole('button', { name: `Select ${selection} USD` }));
}

it('lets users reload the catalog after a failed request', async () => {
  vi.mocked(apiClient.get).mockImplementationOnce((url: string) => {
    expect(url).toBe('/api/stripe/app-pricing');
    return Promise.reject(new Error('Catalog unavailable'));
  });
  renderPricing();

  expect(await screen.findByRole('alert')).toHaveTextContent('Plans could not be loaded.');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('Individual')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

describe('App Pricing billing periods', () => {
  it('shows the yearly savings and rounds the monthly equivalent while keeping the exact total', async () => {
    renderPricing();
    expect(await screen.findByRole('tab', { name: 'Yearly Save up to 10%' })).toBeInTheDocument();
    expect(screen.getByText('$266')).toBeInTheDocument();
    expect(screen.getByText('$3,186 billed yearly')).toBeInTheDocument();
  });

  it('shows the discount on the monthly view so users can compare periods', async () => {
    renderPricing(plans, '/?billingCycle=monthly');
    expect(await screen.findByRole('tab', { name: 'Yearly Save up to 10%' })).toBeInTheDocument();
    expect(screen.getByText('$295')).toBeInTheDocument();
  });

  it('omits the discount when the monthly price covers a different package', async () => {
    const differentPackages = plans.map(plan => ({
      ...plan,
      offers: plan.offers.map(offer =>
        offer.billingCycle === 'monthly' ? { ...offer, seats: 1 } : offer
      ),
    }));
    renderPricing(differentPackages);
    expect(await screen.findByRole('tab', { name: 'Yearly' })).toBeInTheDocument();
    expect(screen.queryByText(/Save up to/)).not.toBeInTheDocument();
  });
});

it('offers current-plan details and support while an existing paid subscription blocks new checkout', async () => {
  renderPricing(catalogWithTeam, '/', { name: 'Team', planType: 'PAID' });

  expect(await screen.findByRole('link', { name: 'View current plan' })).toHaveAttribute(
    'href',
    '/ui/project-1/project-settings/subscription'
  );
  expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute(
    'href',
    'https://support.owox.com/hc/en-us/requests/new'
  );
  expect(screen.queryByRole('button', { name: /^Select / })).not.toBeInTheDocument();
});

describe('App Pricing recovery from an unpaid subscription', () => {
  it('links to the invoice on the previous plan even when checkout started on another plan', async () => {
    await requestCheckout(invoiceUrl, {
      catalog: catalogWithTeam,
      selection: 'Team',
    });
    const link = await screen.findByRole('link', { name: 'Pay outstanding invoice' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(link).toHaveAttribute('href', invoiceUrl);
    expect(link.closest('[data-slot="card"]')).toHaveTextContent('Individual');
    expect(screen.getByRole('button', { name: 'Select Team USD' })).toBeDisabled();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/stripe/app-checkout-sessions',
      expect.objectContaining({
        priceId: 'price_team_yearly',
        billingAccount: 'billing@example.test',
      }),
      expect.any(Object)
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select Individual USD' })).not.toBeInTheDocument();
  });

  it('keeps the invoice available when the previous plan is unknown', async () => {
    await requestCheckout(invoiceUrl, { previousProductId: null });
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('link', { name: 'Pay outstanding invoice' })).toHaveAttribute(
      'href',
      invoiceUrl
    );
    expect(screen.getByRole('button', { name: 'Select Individual USD' })).toBeDisabled();
  });

  it.each([null, 'https://invoice.stripe.com.example.test/pay'])(
    'keeps checkout blocked when a trusted invoice link is unavailable (%s)',
    async recoveryUrl => {
      await requestCheckout(recoveryUrl);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The invoice is currently unavailable'
      );
      expect(
        screen.queryByRole('link', { name: 'Pay outstanding invoice' })
      ).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Contact support' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Select Individual USD' })
      ).not.toBeInTheDocument();
    }
  );
});
