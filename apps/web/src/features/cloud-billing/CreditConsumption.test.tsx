import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../../app/api/apiClient';
import { CreditConsumption } from './CreditConsumption';
import type {
  ConsumptionBranch,
  ConsumptionProjection,
  ConsumptionUnit,
  CreditBalance,
} from './cloud-billing';

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
  entityProjections: Record<string, ConsumptionProjection[]>,
  subscriptionPlanType: CreditBalance['subscriptionPlanType'] = 'PAID',
  product = 'DATA_MARTS'
) {
  const credits = units.reduce((total, operation) => total + operation.credits, 0);
  vi.mocked(apiClient.get).mockImplementation(async url => ({
    data:
      url === '/api/bi-projects/balance'
        ? {
            subscriptionPlanType,
            consumedCredits: credits,
            availableCredits: 500,
            creditUsagePercentage: 10,
          }
        : { credits, products: [{ product, credits, units, entityProjections }] },
  }));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CreditConsumption origin='https://billing.example.test' />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('Credits consumption by license', () => {
  it('groups nested rows by license and links to the originating project', async () => {
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
        DATA_MART: [projection('eu-mart', 'Orders'), projection('cloud-mart', 'Cloud orders')],
      }
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Google Sheets Report Run' }));
    const europe = within(screen.getByRole('region', { name: 'Europe deployment' }));
    const us = within(screen.getByRole('region', { name: 'US deployment' }));
    const cloud = within(screen.getByRole('region', { name: 'Default consumption' }));
    expect(us.getByRole('cell', { name: '5' })).toBeInTheDocument();
    expect(cloud.getByRole('link', { name: 'Cloud orders' })).toHaveAttribute(
      'href',
      '/ui/cloud-project/data-marts/cloud-mart/data-setup'
    );
    expect(
      europe.getAllByRole('link', { name: 'Orders' }).map(link => link.getAttribute('href'))
    ).toEqual([
      'https://eu.example.test/ui/first%20%2F%20project/data-marts/eu-mart/data-setup',
      'https://eu.example.test/ui/second-project/data-marts/eu-mart/data-setup',
    ]);
    expect(europe.queryByText(/license-eu|first \/ project/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('row', { name: /MCP Query Run/ }));
    expect(screen.getByRole('button', { name: 'Google Sheets Report Run' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    const mcp = within(screen.getByRole('table', { name: /MCP Query Run details/ }));
    expect(mcp.getByRole('link', { name: 'Orders' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'US deployment' })).not.toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('button', { name: 'Google Sheets Report Run' }));
    expect(
      within(screen.getByRole('region', { name: 'Invalid license attribution' })).getByRole(
        'cell',
        { name: '2' }
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Unknown license' })).getByRole('cell', {
        name: '4',
      })
    ).toBeInTheDocument();
    const unsafe = within(screen.getByRole('region', { name: 'Unsafe origin' }));
    expect(unsafe.getByText('Support tickets')).toBeInTheDocument();
    expect(unsafe.queryByRole('link')).not.toBeInTheDocument();
  });
});

it('shows operations immediately and renders paginated Process Run details on row click', async () => {
  const rows = Array.from({ length: 11 }, (_, index) =>
    branch(1, { PRODUCT_NAME: 'TRANSFORMATION', PROCESS_RUN_ENTITY_ID: `operation-${index + 1}` })
  );
  renderCredits(
    [unit('PLATFORM_PROCESS_RUN', 11, rows)],
    {
      TRANSFORMATION: [
        {
          ...projection('transformation', 'Sales'),
          childEntities: rows.map((row, index) =>
            projection(row.labels.PROCESS_RUN_ENTITY_ID, `Step ${index + 1}`)
          ),
        },
      ],
    },
    'NOT_PAID',
    'PLATFORM'
  );

  const operation = await screen.findByRole('button', { name: 'Process Run' });
  expect(screen.getByText('Credits consumed')).toBeInTheDocument();
  expect(screen.queryByText('Available credits')).not.toBeInTheDocument();
  expect(operation).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('Last calculated Nov 10, 2026, 01:12 PM')).toBeInTheDocument();
  expect(screen.queryByRole('table', { name: 'Process Run details' })).not.toBeInTheDocument();
  fireEvent.click(operation);
  const details = within(screen.getByRole('table', { name: 'Process Run details' }));
  expect(details.getByText('Sales · Step 1')).toBeInTheDocument();
  expect(details.queryByText('Sales · Step 11')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
  expect(details.getByText('Sales · Step 11')).toBeInTheDocument();
  expect(details.queryByText('Sales · Step 1')).not.toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText('Search details'), { target: { value: 'step 2' } });
  await details.findByText('Sales · Step 2');
  expect(details.queryByText('Sales · Step 11')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const [field, operator] = await within(await screen.findByRole('dialog')).findAllByRole(
    'combobox'
  );
  fireEvent.pointerDown(field, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(await screen.findByRole('option', { name: 'Title' }));
  fireEvent.pointerDown(operator, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(await screen.findByRole('option', { name: 'contains' }));
  fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 'Step 11' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

  await details.findByText('Sales · Step 11');
  expect(details.queryByText('Sales · Step 1')).not.toBeInTheDocument();
  expect(
    vi.mocked(apiClient.get).mock.calls.filter(([url]) => url.includes('project-summary'))
  ).toHaveLength(1);
});

it('links to the Google Sheets document and tab using names from the report projections', async () => {
  renderCredits(
    [
      unit('SMART_DATA_REPORT_RUN_LITE', 5, [
        branch(5, { GOOGLE_SHEETS_DOCUMENT: 'document-1' }, [
          branch(5, { GOOGLE_SHEETS_DOCUMENT_LIST: '123' }),
        ]),
      ]),
    ],
    {
      GOOGLE_SHEETS_DOCUMENT: [
        {
          ...projection('document-1', 'Sales report'),
          childEntities: [projection('123', 'November data')],
        },
      ],
    },
    'PAID',
    'PLATFORM'
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Report Run' }));

  const details = within(screen.getByRole('table', { name: 'Report Run details' }));
  expect(details.getByRole('link', { name: 'Sales report' })).toHaveAttribute(
    'href',
    'https://docs.google.com/spreadsheets/d/document-1'
  );
  const sheet = details.getByRole('link', { name: 'November data' });
  expect(sheet).toHaveAttribute(
    'href',
    'https://docs.google.com/spreadsheets/d/document-1/edit#gid=123'
  );
  expect(sheet).toHaveAttribute('target', '_blank');
});
