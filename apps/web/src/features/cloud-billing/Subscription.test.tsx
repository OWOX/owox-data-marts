import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '../../app/api/apiClient';
import { useUser } from '../idp/hooks/useAuthState';
import type { User } from '../idp/types';
import { Subscription } from './Subscription';
import type { SubscriptionDetails } from './cloud-billing';

vi.mock('../../app/api/apiClient', () => ({ default: { get: vi.fn() } }));
vi.mock('../idp/hooks/useAuthState', () => ({
  useUser: vi.fn(),
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

function renderSubscription(subscription: SubscriptionDetails, user: Partial<User> = {}) {
  vi.mocked(useUser).mockReturnValue({
    id: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    ...user,
  });
  vi.mocked(apiClient.get).mockResolvedValueOnce({ data: subscription });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Subscription origin={origin} />
    </QueryClientProvider>
  );
}

describe('Subscription notices', () => {
  it('shows the actual subscription status for an active Internal plan', async () => {
    renderSubscription({ ...freePlan, name: 'Internal', planType: 'NOT_PAID' });

    expect(await screen.findByRole('heading', { name: 'Internal' })).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Unpaid')).not.toBeInTheDocument();
    expect(screen.queryByText('Price')).not.toBeInTheDocument();
    expect(screen.queryByText('Credits', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Billing help' })).toHaveAttribute(
      'href',
      'https://support.owox.com/hc/en-us/sections/12401110143892'
    );
  });

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
  expect(screen.getByText('Price')).toBeInTheDocument();
  expect(screen.getByText('Credits per month')).toBeInTheDocument();
  expect(apiClient.get).toHaveBeenCalledWith(
    '/api/billing/subscription-details',
    expect.objectContaining({ baseURL: origin, skipLogoutOnUnauthorizedRetry: true })
  );
});

it('shows credits for a one-time plan with a positive credit allowance', async () => {
  renderSubscription({ ...freePlan, name: 'Internal', planType: 'NOT_PAID', credits: 250 });

  expect(await screen.findByText('Credits', { exact: true })).toBeInTheDocument();
  expect(screen.getByText('250')).toBeInTheDocument();
  expect(screen.queryByText('Price')).not.toBeInTheDocument();
});

describe('Subscription billing portal', () => {
  const internalPlan: SubscriptionDetails = {
    ...freePlan,
    name: 'Internal',
    planType: 'NOT_PAID',
    billingAccount: 'billing@example.test',
  };

  it('links to Stripe when an Internal plan has a billing account', async () => {
    renderSubscription(internalPlan, { roles: ['editor'] });

    const link = await screen.findByRole('link', { name: 'Change card & billing info' });
    expect(link).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/payments\.bi\.owox\.com\/p\/login\//)
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/use the billing account email above/i)).toBeInTheDocument();
  });

  it.each([
    { ...freePlan, billingAccount: 'billing@example.test' },
    { ...internalPlan, billingAccount: null },
  ])('shows View plans for $name without an eligible billing account', async subscription => {
    renderSubscription(subscription, { roles: ['editor'] });

    expect(await screen.findByRole('link', { name: 'View plans' })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Change card & billing info' })
    ).not.toBeInTheDocument();
  });
});
