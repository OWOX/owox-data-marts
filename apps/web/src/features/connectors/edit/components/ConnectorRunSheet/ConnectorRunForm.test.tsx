import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectorRunForm } from './ConnectorRunForm';
import { RequiredType } from '../../../shared/api';
import { ConnectorSpecificationAttribute } from '../../../shared/enums/connector-specification-attribute.enum';
import type { ConnectorDefinitionConfig } from '../../../../data-marts/edit';

const dateField = (name: string, title: string) => ({
  name,
  title,
  description: `${title} of the period to import`,
  requiredType: RequiredType.DATE,
  attributes: [ConnectorSpecificationAttribute.MANUAL_BACKFILL],
});

vi.mock('../../../shared/model/hooks/useConnector', () => ({
  useConnector: () => ({
    loading: false,
    loadingSpecification: false,
    connectorSpecification: [
      dateField('StartDate', 'Start Date'),
      dateField('EndDate', 'End Date'),
    ],
    fetchConnectorSpecification: vi.fn(),
  }),
}));

vi.mock('../../../../data-marts/edit/model', () => ({
  useDataMartContext: () => ({ dataMart: null }),
}));

vi.mock('./ConnectorStateSection', () => ({
  ConnectorStateSection: () => null,
}));

const configuration = {
  connector: { source: { name: 'FacebookMarketing' } },
} as unknown as ConnectorDefinitionConfig;

const todayIso = new Date().toISOString().slice(0, 10);

async function openBackfill(onSubmit = vi.fn()) {
  render(<ConnectorRunForm configuration={configuration} onSubmit={onSubmit} />);
  await act(async () => {
    fireEvent.click(screen.getByLabelText('Backfill (custom period)'));
  });
  return onSubmit;
}

const dateInput = (label: string) => screen.getByLabelText(label, { selector: 'input' });

function setPeriod(startDate: string, endDate: string) {
  fireEvent.input(dateInput('Start Date'), { target: { value: startDate } });
  fireEvent.input(dateInput('End Date'), { target: { value: endDate } });
}

async function submit() {
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Run' }).closest('form')!);
  });
}

describe('ConnectorRunForm backfill limit', () => {
  it('explains the per-run limit before any dates are chosen', async () => {
    await openBackfill();

    expect(screen.getByTestId('backfill-limit-notice')).toHaveTextContent(
      'A backfill run can cover at most 31 days'
    );
  });

  it('reports a full calendar month as a valid period', async () => {
    await openBackfill();

    setPeriod('2026-07-01', '2026-07-31');

    await waitFor(() => {
      expect(screen.getByTestId('backfill-limit-notice')).toHaveTextContent(
        'This backfill covers 31 days.'
      );
    });
  });

  it('warns about and blocks a period longer than 31 days', async () => {
    const onSubmit = await openBackfill();

    setPeriod('2026-01-01', '2026-03-16');
    await waitFor(() => {
      expect(screen.getByTestId('backfill-limit-notice')).toHaveTextContent(
        'covers 75 days, which exceeds the 31-day limit'
      );
    });
    await submit();

    expect(await screen.findByText('The period cannot exceed 31 days')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks submission when the end date precedes the start date', async () => {
    const onSubmit = await openBackfill();

    setPeriod('2026-07-10', '2026-07-01');
    await submit();

    expect(
      await screen.findByText('End date must be on or after the start date')
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('caps the date inputs at today', async () => {
    await openBackfill();

    expect(dateInput('Start Date')).toHaveAttribute('max', todayIso);
  });
});
