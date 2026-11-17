import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '../../app/api/apiClient';
import { Subscription } from './Subscription';
import type { SubscriptionDetails } from './cloud-billing';

vi.mock('../../app/api/apiClient', () => ({ default: { get: vi.fn() } }));
vi.mock('../idp/hooks/useAuthState', () => ({
  useUser: () => ({ id: 'user-1', projectId: 'project-1', roles: ['viewer'] }),
}));

const origin = 'https://ib.example.test';
const freePlan: SubscriptionDetails = {
  billingAccount: null,
  name: 'Free',
  status: 'ACTIVE',
  startDate: [2026, 11, 1],
  endDate: null,
  billingCycle: 'NON_RECURRING',
  price: 0,
  currency: 'USD',
  credits: 0,
  creditsPerMonth: 0,
  planType: 'FREE',
  subscribeReason: 'FIRST_INTERACTION',
};

function renderSubscription(subscription: SubscriptionDetails) {
  vi.mocked(apiClient.get).mockResolvedValueOnce({ data: subscription });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Subscription origin={origin} />
    </QueryClientProvider>
  );
}

describe('Subscription notices', () => {
  it.each([
    ['PREVIOUS_SUBSCRIPTION_UNPAID', /previous subscription was unpaid/],
    ['PREVIOUS_SUBSCRIPTION_CANCELED', /previous subscription was canceled/],
  ])('explains a move to Free with reason %s', async (subscribeReason, message) => {
    renderSubscription({ ...freePlan, subscribeReason });

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('heading', { name: 'Free' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it.each([
    freePlan,
    {
      ...freePlan,
      name: 'Team',
      planType: 'PAID' as const,
      subscribeReason: 'PREVIOUS_SUBSCRIPTION_UNPAID',
    },
  ])('shows no notice for $name without a move to Free', async subscription => {
    renderSubscription(subscription);

    expect(await screen.findByRole('heading', { name: subscription.name })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

it('renders the billing dates from the IB calendar date arrays', async () => {
  renderSubscription({
    ...freePlan,
    name: 'Team',
    planType: 'PAID',
    billingCycle: 'MONTHLY',
    endDate: [2026, 12, 1],
  });
  const format = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

  expect(await screen.findByText(format.format(new Date('2026-11-01')))).toBeInTheDocument();
  expect(screen.getByText(format.format(new Date('2026-12-01')))).toBeInTheDocument();
  expect(apiClient.get).toHaveBeenCalledWith(
    '/api/billing/subscription-details',
    expect.objectContaining({ baseURL: origin, skipLogoutOnUnauthorizedRetry: true })
  );
});
