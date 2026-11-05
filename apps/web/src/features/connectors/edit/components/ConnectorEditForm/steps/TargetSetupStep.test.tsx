import { TargetSetupStep } from './TargetSetupStep.tsx';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useState } from 'react';
import { DataStorageType } from '../../../../../data-storage';

type Target = { fullyQualifiedName: string; isValid: boolean } | null;

// Mirrors ConnectorEditForm: the target the step emits is fed straight back as a prop.
// That echo is what used to wipe the fields, so the test harness must reproduce it.
// The step renders a doc link, so it also needs a router context.
// Changing stepKey remounts the step while the harness keeps the target,
// simulating Back/Next navigation in the wizard.
function TargetSetupStepHarness({
  dataStorageType,
  stepKey = 1,
  fixedDatasetName,
}: {
  dataStorageType: DataStorageType;
  stepKey?: number;
  fixedDatasetName?: string;
}) {
  const [target, setTarget] = useState<Target>(null);

  return (
    <MemoryRouter>
      <TargetSetupStep
        key={stepKey}
        dataStorageType={dataStorageType}
        fixedDatasetName={fixedDatasetName}
        destinationName='ad_insights'
        connectorName='TikTok Ads'
        target={target}
        onTargetChange={setTarget}
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

  it('fixes the dataset of an OWOX Storage', () => {
    render(
      <TargetSetupStepHarness
        dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
        fixedDatasetName='owox_abc'
      />
    );

    const datasetInput = screen.getByLabelText(/dataset name/i, { selector: 'input' });
    expect(datasetInput).toHaveValue('owox_abc');
    expect(datasetInput).toHaveAttribute('readonly');
    expect(screen.queryByText(/dataset is auto-created/i)).toBeNull();
    expect(screen.getByLabelText(/table name/i, { selector: 'input' })).toHaveValue('ad_insights');
  });

  it('writes the target of an OWOX Storage into its dataset', () => {
    const onTargetChange = vi.fn();
    render(
      <MemoryRouter>
        <TargetSetupStep
          dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
          fixedDatasetName='owox_abc'
          destinationName='ad_insights'
          connectorName='TikTok Ads'
          target={null}
          onTargetChange={onTargetChange}
        />
      </MemoryRouter>
    );

    expect(onTargetChange).toHaveBeenCalledWith({
      fullyQualifiedName: 'owox_abc.ad_insights',
      isValid: true,
    });
  });

  it('keeps the editable dataset for other storages', () => {
    render(<TargetSetupStepHarness dataStorageType={DataStorageType.GOOGLE_BIGQUERY} />);

    const datasetInput = screen.getByLabelText(/dataset name/i, { selector: 'input' });
    expect(datasetInput).not.toHaveAttribute('readonly');
    expect(screen.getByText(/dataset is auto-created/i)).toBeInTheDocument();
  });

  it('replaces the dataset of an existing target with the fixed one', () => {
    const onTargetChange = vi.fn();
    render(
      <MemoryRouter>
        <TargetSetupStep
          dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
          fixedDatasetName='owox_abc'
          destinationName='ad_insights'
          connectorName='TikTok Ads'
          target={{ fullyQualifiedName: 'old_ds.ad_insights', isValid: true }}
          onTargetChange={onTargetChange}
        />
      </MemoryRouter>
    );

    expect(onTargetChange).toHaveBeenCalledWith({
      fullyQualifiedName: 'owox_abc.ad_insights',
      isValid: true,
    });
  });
});
