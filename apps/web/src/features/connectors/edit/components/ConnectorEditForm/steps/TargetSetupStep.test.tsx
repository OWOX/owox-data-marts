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
  onTarget,
}: {
  dataStorageType: DataStorageType;
  stepKey?: number;
  onTarget?: (target: Target) => void;
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
        onTargetChange={next => {
          setTarget(next);
          onTarget?.(next);
        }}
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

  describe('DuckDB', () => {
    const renderDuckDb = () => {
      const onTarget = vi.fn();
      render(
        <TargetSetupStepHarness dataStorageType={DataStorageType.DUCKDB} onTarget={onTarget} />
      );
      return {
        onTarget,
        schemaInput: screen.getByLabelText(/schema name/i, { selector: 'input' }),
        tableInput: screen.getByLabelText(/table name/i, { selector: 'input' }),
      };
    };

    it('builds schema.table from the two fields', () => {
      const { onTarget, schemaInput, tableInput } = renderDuckDb();
      expect(onTarget).toHaveBeenLastCalledWith({
        fullyQualifiedName: 'tiktok_ads_owox.ad_insights',
        isValid: true,
      });

      fireEvent.change(schemaInput, { target: { value: 'main' } });
      fireEvent.change(tableInput, { target: { value: 'holidays' } });

      expect(onTarget).toHaveBeenLastCalledWith({
        fullyQualifiedName: 'main.holidays',
        isValid: true,
      });
    });

    it('keeps the schema when the table name is cleared', () => {
      const { onTarget, schemaInput, tableInput } = renderDuckDb();

      fireEvent.change(tableInput, { target: { value: '' } });

      expect(schemaInput).toHaveValue('tiktok_ads_owox');
      expect(onTarget).toHaveBeenLastCalledWith({ fullyQualifiedName: '', isValid: false });
    });

    it('flags a schema name that is not a single identifier', () => {
      const { onTarget, schemaInput } = renderDuckDb();

      fireEvent.change(schemaInput, { target: { value: 'db.main' } });

      expect(schemaInput).toHaveAttribute('aria-invalid', 'true');
      expect(
        screen.getByText('Use letters, numbers, and underscores; start with a letter')
      ).toBeInTheDocument();
      expect(onTarget).toHaveBeenLastCalledWith({
        fullyQualifiedName: 'db.main.ad_insights',
        isValid: false,
      });
    });
  });
});
