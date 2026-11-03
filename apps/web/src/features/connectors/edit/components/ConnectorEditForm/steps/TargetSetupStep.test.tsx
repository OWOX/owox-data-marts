import { TargetSetupStep } from './TargetSetupStep.tsx';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useState } from 'react';
import type { ConnectorTargetConflictResponseDto } from '../../../../../data-marts/shared/types/api/response/connector-target-conflict.response.dto';
import { DataStorageType } from '../../../../../data-storage';

vi.mock('../../../../../../shared/hooks/useProjectRoute', () => ({
  useProjectRoute: () => ({ scope: (path: string) => `/ui/p1${path}` }),
}));

const SAME_TABLE = 'Each run replaces the table, so the two Data Marts will overwrite each other.';

type Target = { fullyQualifiedName: string; isValid: boolean } | null;

// Mirrors ConnectorEditForm: the target the step emits is fed straight back as a prop.
// That echo is what used to wipe the fields, so the test harness must reproduce it.
// The step renders a doc link, so it also needs a router context.
// Changing stepKey remounts the step while the harness keeps the target,
// simulating Back/Next navigation in the wizard.
function TargetSetupStepHarness({
  dataStorageType,
  stepKey = 1,
  conflict,
}: {
  conflict?: ConnectorTargetConflictResponseDto | null;
  dataStorageType: DataStorageType;
  stepKey?: number;
}) {
  const [target, setTarget] = useState<Target>(null);

  return (
    <MemoryRouter>
      <TargetSetupStep
        key={stepKey}
        dataStorageType={dataStorageType}
        destinationName='ad_insights'
        connectorName='TikTok Ads'
        target={target}
        onTargetChange={setTarget}
        conflict={conflict}
      />
    </MemoryRouter>
  );
}

describe('TargetSetupStep', () => {
  it('keeps the dataset name when the table name is cleared', () => {
    render(<TargetSetupStepHarness dataStorageType={DataStorageType.GOOGLE_BIGQUERY} />);
    const datasetInput = screen.getByLabelText(/dataset name/i, { selector: 'input' });
    const tableInput = screen.getByLabelText(/table name/i, { selector: 'input' });
    expect(datasetInput).toHaveValue('tiktok_ads_owox');

    fireEvent.change(tableInput, { target: { value: '' } });

    expect(datasetInput).toHaveValue('tiktok_ads_owox');
  });

  it('accepts dataset input while the table name is empty', () => {
    render(<TargetSetupStepHarness dataStorageType={DataStorageType.GOOGLE_BIGQUERY} />);
    const datasetInput = screen.getByLabelText(/dataset name/i, { selector: 'input' });
    const tableInput = screen.getByLabelText(/table name/i, { selector: 'input' });
    fireEvent.change(tableInput, { target: { value: '' } });

    fireEvent.change(datasetInput, { target: { value: 'a' } });

    expect(datasetInput).toHaveValue('a');
  });

  it('re-seeds defaults after a remount with a cleared table instead of empty fields', () => {
    const { rerender } = render(
      <TargetSetupStepHarness dataStorageType={DataStorageType.GOOGLE_BIGQUERY} stepKey={1} />
    );
    const tableInput = screen.getByLabelText(/table name/i, { selector: 'input' });
    fireEvent.change(tableInput, { target: { value: '' } });

    // Back then Next remounts the step; the parent keeps the last emitted target.
    rerender(
      <TargetSetupStepHarness dataStorageType={DataStorageType.GOOGLE_BIGQUERY} stepKey={2} />
    );

    expect(screen.getByLabelText(/dataset name/i, { selector: 'input' })).toHaveValue(
      'tiktok_ads_owox'
    );
    expect(screen.getByLabelText(/table name/i, { selector: 'input' })).toHaveValue('ad_insights');
  });

  it('keeps the database and schema when the table name is cleared for Snowflake', () => {
    render(<TargetSetupStepHarness dataStorageType={DataStorageType.SNOWFLAKE} />);
    const databaseInput = screen.getByLabelText(/database name/i, { selector: 'input' });
    const schemaInput = screen.getByLabelText(/schema name/i, { selector: 'input' });
    const tableInput = screen.getByLabelText(/table name/i, { selector: 'input' });

    fireEvent.change(tableInput, { target: { value: '' } });

    expect(databaseInput).toHaveValue('tiktok_ads_owox');
    expect(schemaInput).toHaveValue('PUBLIC');
  });

  it('warns with a link to the Data Mart that writes the same table', () => {
    render(
      <TargetSetupStepHarness
        dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
        conflict={{ conflict: true, dataMart: { id: 'dm-2', title: 'Plan 2026' } }}
      />
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(`Already used by Plan 2026. ${SAME_TABLE}`);
    expect(screen.getByRole('link', { name: 'Plan 2026' }).getAttribute('href')).toMatch(
      /\/data-marts\/dm-2\/data-setup$/
    );
  });

  it('says another Data Mart when the member cannot see it', () => {
    render(
      <TargetSetupStepHarness
        dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
        conflict={{ conflict: true, dataMart: null }}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `Already used by another Data Mart. ${SAME_TABLE}`
    );
    expect(screen.queryByRole('link', { name: /another data mart/i })).toBeNull();
  });

  it('shows no warning without a conflict', () => {
    render(
      <TargetSetupStepHarness
        dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
        conflict={{ conflict: false, dataMart: null }}
      />
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('a conflict leaves the target valid', () => {
    const onTargetChange = vi.fn();
    render(
      <MemoryRouter>
        <TargetSetupStep
          dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
          destinationName='ad_insights'
          connectorName='TikTok Ads'
          target={null}
          onTargetChange={onTargetChange}
          conflict={{ conflict: true, dataMart: null }}
        />
      </MemoryRouter>
    );
    expect(onTargetChange).toHaveBeenLastCalledWith(expect.objectContaining({ isValid: true }));
  });
});
