import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const specification = {
  current: [dateField('StartDate', 'Start Date'), dateField('EndDate', 'End Date')] as unknown[],
};

vi.mock('../../../shared/model/hooks/useConnector', () => ({
  useConnector: () => ({
    loading: false,
    loadingSpecification: false,
    connectorSpecification: specification.current,
    fetchConnectorSpecification: vi.fn(),
  }),
}));

beforeEach(() => {
  specification.current = [dateField('StartDate', 'Start Date'), dateField('EndDate', 'End Date')];
});

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

const notice = () => screen.getByTestId('backfill-limit-notice');
const runButton = () => screen.getByRole('button', { name: 'Run' });

describe('ConnectorRunForm backfill period', () => {
  it('explains segmentation before any dates are chosen, without flagging an error', async () => {
    const onSubmit = await openBackfill();

    expect(notice()).toHaveTextContent('runs automatically in segments of up to 31 days');
    // The untouched state is a hint, not a validation failure.
    expect(notice().className).not.toContain('destructive');
    // Validation runs on submit, so the empty required dates block the run there.
    await act(async () => {
      fireEvent.click(runButton());
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows no period notice for a connector that declares no backfill date fields', async () => {
    specification.current = [];

    await openBackfill();

    expect(screen.queryByTestId('backfill-limit-notice')).not.toBeInTheDocument();
    expect(runButton()).toBeEnabled();
  });

  it('reports a full calendar month as a valid period and enables Run', async () => {
    await openBackfill();

    setPeriod('2026-07-01', '2026-07-31');

    await waitFor(() => {
      expect(notice()).toHaveTextContent('This backfill covers 31 days.');
      expect(runButton()).toBeEnabled();
    });
  });

  it('allows a period longer than 31 days and says how many runs it counts as', async () => {
    await openBackfill();

    setPeriod('2026-01-01', '2026-03-31');

    await waitFor(() => {
      expect(notice()).toHaveTextContent(
        'This backfill covers 90 days and runs in 3 segments of up to 31 days. It counts as 3 runs.'
      );
      expect(runButton()).toBeEnabled();
    });
    expect(notice().className).not.toContain('destructive');
    expect(notice()).not.toHaveTextContent('Large backfills');
  });

  it('warns that a period over a year can take hours, without blocking it', async () => {
    await openBackfill();

    setPeriod('2024-01-01', '2025-06-30');

    await waitFor(() => {
      expect(notice()).toHaveTextContent('runs in 18 segments');
      expect(notice()).toHaveTextContent('Large backfills can take hours');
      expect(runButton()).toBeEnabled();
    });
  });

  it('explains and blocks an end date before the start date', async () => {
    await openBackfill();

    setPeriod('2026-07-10', '2026-07-01');

    await waitFor(() => {
      expect(notice()).toHaveTextContent('The end date must be on or after the start date.');
      expect(runButton()).toBeDisabled();
    });
  });

  it('explains and blocks a start date in the future', async () => {
    await openBackfill();

    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setPeriod(future, future);

    await waitFor(() => {
      expect(notice()).toHaveTextContent('The start date cannot be in the future.');
      expect(runButton()).toBeDisabled();
    });
  });

  it('blocks an end date in the future, so no run count is quoted for days it cannot load', async () => {
    // The input carries max=today, but the form is noValidate, so a typed day gets this far.
    const onSubmit = await openBackfill();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    setPeriod('2026-01-01', future);

    await waitFor(() => {
      expect(runButton()).toBeDisabled();
    });
    // Run is disabled with no field message shown, so the notice has to say why.
    expect(notice()).toHaveTextContent(
      'The end date cannot be in the future. Pick a date up to today.'
    );
    expect(notice()).not.toHaveTextContent('counts as');
    expect(notice().className).toContain('destructive');
    await act(async () => {
      fireEvent.click(runButton());
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('explains and blocks a start date before the earliest allowed day', async () => {
    const onSubmit = await openBackfill();

    // A typo such as year 0202 would otherwise plan tens of thousands of segments.
    setPeriod('0202-01-01', '2026-01-31');

    await waitFor(() => {
      expect(runButton()).toBeDisabled();
    });
    expect(notice()).toHaveTextContent(
      'The start date cannot be earlier than 2000-01-01. Pick a later date.'
    );
    expect(notice()).not.toHaveTextContent('counts as');
    expect(notice().className).toContain('destructive');
    await act(async () => {
      fireEvent.click(runButton());
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('accepts the earliest allowed start date', async () => {
    await openBackfill();

    setPeriod('2000-01-01', '2000-01-31');

    await waitFor(() => {
      expect(notice()).toHaveTextContent('This backfill covers 31 days.');
      expect(runButton()).toBeEnabled();
    });
  });

  it('marks the notice as a status region so it is not announced assertively', async () => {
    await openBackfill();

    expect(notice()).toHaveAttribute('role', 'status');
  });

  it('caps the date inputs at today', async () => {
    await openBackfill();

    expect(dateInput('Start Date')).toHaveAttribute('max', todayIso);
  });

  it('floors the start date input at the earliest allowed day', async () => {
    await openBackfill();

    expect(dateInput('Start Date')).toHaveAttribute('min', '2000-01-01');
    expect(dateInput('End Date')).not.toHaveAttribute('min');
  });
});

describe('ConnectorRunForm backfill confirmation', () => {
  const clickRun = () =>
    act(async () => {
      fireEvent.click(runButton());
    });
  const dialog = () => screen.queryByRole('dialog');

  it('submits a one-segment period straight through, without asking', async () => {
    const onSubmit = await openBackfill();
    setPeriod('2026-07-01', '2026-07-31');
    await waitFor(() => {
      expect(runButton()).toBeEnabled();
    });

    await clickRun();

    expect(dialog()).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ StartDate: '2026-07-01', EndDate: '2026-07-31' }),
      })
    );
  });

  it('asks how many runs a multi-segment period costs before submitting', async () => {
    const onSubmit = await openBackfill();
    setPeriod('2026-01-01', '2026-03-31');
    await waitFor(() => {
      expect(runButton()).toBeEnabled();
    });

    await clickRun();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('Start a backfill of 3 runs?')).toBeInTheDocument();
    expect(dialog()).toHaveTextContent('This backfill covers 90 days.');
    expect(screen.getByRole('button', { name: 'Start 3 runs' })).toBeInTheDocument();
  });

  it('submits the same payload once when the user confirms', async () => {
    const onSubmit = await openBackfill();
    setPeriod('2026-01-01', '2026-03-31');
    await waitFor(() => {
      expect(runButton()).toBeEnabled();
    });
    await clickRun();

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Start 3 runs' }));
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ StartDate: '2026-01-01', EndDate: '2026-03-31' }),
      })
    );
    await waitFor(() => {
      expect(dialog()).not.toBeInTheDocument();
    });
  });

  it('keeps the form and its dates when the user keeps editing', async () => {
    const onSubmit = await openBackfill();
    setPeriod('2026-01-01', '2026-03-31');
    await waitFor(() => {
      expect(runButton()).toBeEnabled();
    });
    await clickRun();

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    });

    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(dialog()).not.toBeInTheDocument();
    });
    expect(dateInput('Start Date')).toHaveValue('2026-01-01');
    expect(dateInput('End Date')).toHaveValue('2026-03-31');
  });
});
