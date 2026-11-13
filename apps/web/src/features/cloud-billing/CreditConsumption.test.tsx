import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import apiClient from '../../app/api/apiClient';
import { CreditConsumption } from './CreditConsumption';
import type { ConsumptionBranch, ConsumptionProjection, ConsumptionUnit } from './cloud-billing';

vi.mock('../../app/api/apiClient', () => ({ default: { get: vi.fn() } }));
vi.mock('../idp/hooks/useAuthState', () => ({
  useUser: () => ({ id: 'user-1', projectId: 'cloud-project', roles: ['viewer'] }),
}));

function branch(
  consumption: number,
  labels: ConsumptionBranch['labels'],
  childBranches: ConsumptionBranch[] | null = null
): ConsumptionBranch {
  return { consumption, labels, childBranches };
}

function unit(
  name: string,
  consumption: number,
  decomposition: ConsumptionBranch[]
): ConsumptionUnit {
  return {
    unit: name,
    consumption,
    roundedConsumption: consumption,
    consumptionUnitPrice: 1,
    credits: consumption,
    updated: '2026-11-10T13:12:00',
    decomposition,
  };
}

function projection(
  id: string,
  title: string,
  origin: string | null = null
): ConsumptionProjection {
  return { id, title, origin, childEntities: null };
}

function renderCredits(
  units: ConsumptionUnit[],
  entityProjections: Record<string, ConsumptionProjection[]>
) {
  const credits = units.reduce((total, operation) => total + operation.credits, 0);
  vi.mocked(apiClient.get).mockImplementation(async url => ({
    data:
      url === '/api/bi-projects/balance'
        ? { subscriptionPlanType: 'PAID', consumedCredits: credits, availableCredits: 500 }
        : { credits, products: [{ product: 'DATA_MARTS', credits, units, entityProjections }] },
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CreditConsumption origin='https://billing.example.test' />
    </QueryClientProvider>
  );
}

describe('Credits consumption by license', () => {
  it('groups nested rows across operations by license ID and shows the license name and originating project links', async () => {
    renderCredits(
      [
        unit('DATA_MARTS_SHEETS_REPORT_RUN', 20, [
          branch(3, { DATA_MART: 'cloud-mart' }),
          branch(12, { SELF_MANAGED_LICENSE_KEY_ID: 'license-eu' }, [
            branch(7, { SELF_MANAGED_PROJECT_ID: 'first / project', DATA_MART: 'eu-mart' }),
            branch(5, { SELF_MANAGED_PROJECT_ID: 'second-project', DATA_MART: 'eu-mart' }),
          ]),
          branch(5, {
            SELF_MANAGED_LICENSE_KEY_ID: 'license-us',
            SELF_MANAGED_PROJECT_ID: 'us-project',
            DATA_MART: 'us-mart',
          }),
        ]),
        {
          ...unit('DATA_MARTS_MCP_QUERY_RUN', 4, [
            branch(4, {
              SELF_MANAGED_LICENSE_KEY_ID: 'license-eu',
              SELF_MANAGED_PROJECT_ID: 'second-project',
              DATA_MART: 'eu-mart',
            }),
          ]),
          roundedConsumption: 5,
          consumptionUnitPrice: 0.5,
          credits: 2.5,
        },
      ],
      {
        SELF_MANAGED_LICENSE: [
          projection('license-eu', 'Europe deployment', 'https://eu.example.test'),
          projection('license-us', 'US deployment', 'https://us.example.test'),
        ],
        DATA_MART: [projection('eu-mart', 'Orders')],
      }
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Data marts · 22.5 credits' }));
    const europe = within(screen.getByRole('region', { name: 'Europe deployment' }));
    const us = within(screen.getByRole('region', { name: 'US deployment' }));
    const cloud = within(screen.getByRole('region', { name: 'Default consumption' }));
    expect(us.getByRole('button', { name: /5 units/ })).toBeInTheDocument();
    expect(cloud.getByRole('button', { name: /3 units/ })).toBeInTheDocument();
    expect(
      europe.getByRole('button', { name: /mcp query run.*5 units.*2.5 credits/i })
    ).toBeInTheDocument();
    fireEvent.click(europe.getByRole('button', { name: /sheets report run.*12 units/i }));
    expect(
      europe.getAllByRole('link', { name: 'Orders' }).map(link => link.getAttribute('href'))
    ).toEqual([
      'https://eu.example.test/ui/first%20%2F%20project/data-marts/eu-mart/data-setup',
      'https://eu.example.test/ui/second-project/data-marts/eu-mart/data-setup',
    ]);
    expect(europe.queryByText(/license-eu|first \/ project/)).not.toBeInTheDocument();
  });

  it('keeps partial and unknown attribution visible and does not link to an unsafe origin', async () => {
    renderCredits(
      [
        unit('DATA_MARTS_SHEETS_REPORT_RUN', 12, [
          branch(2, { SELF_MANAGED_LICENSE_KEY_ID: 'partial', DATA_MART: 'partial-mart' }),
          branch(4, {
            SELF_MANAGED_LICENSE_KEY_ID: 'missing',
            SELF_MANAGED_PROJECT_ID: 'local-project',
            DATA_MART: 'missing-mart',
          }),
          branch(6, {
            SELF_MANAGED_LICENSE_KEY_ID: 'unsafe',
            SELF_MANAGED_PROJECT_ID: 'local-project',
            DATA_MART: 'unsafe-mart',
          }),
        ]),
      ],
      {
        SELF_MANAGED_LICENSE: [projection('unsafe', 'Unsafe origin', 'javascript:alert(1)')],
        DATA_MART: [projection('unsafe-mart', 'Support tickets')],
      }
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Data marts · 12 credits' }));
    expect(
      within(screen.getByRole('region', { name: 'Invalid license attribution' })).getByRole(
        'button',
        { name: /2 units/ }
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Unknown license' })).getByRole('button', {
        name: /4 units/,
      })
    ).toBeInTheDocument();
    const unsafe = within(screen.getByRole('region', { name: 'Unsafe origin' }));
    fireEvent.click(unsafe.getByRole('button', { name: /6 units/ }));
    expect(unsafe.getByText('Support tickets')).toBeInTheDocument();
    expect(unsafe.queryByRole('link')).not.toBeInTheDocument();
  });
});
