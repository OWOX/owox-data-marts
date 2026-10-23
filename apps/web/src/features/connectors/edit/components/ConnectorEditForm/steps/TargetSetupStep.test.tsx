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
const SHARED_TABLE = 'Both Data Marts will write to this table.';

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
  replacesTable,
  onTarget,
}: {
  conflict?: ConnectorTargetConflictResponseDto | null;
  dataStorageType: DataStorageType;
  replacesTable?: boolean;
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
        conflict={conflict}
        replacesTable={replacesTable}
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
        replacesTable
      />
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(`Already used by Plan 2026. ${SAME_TABLE}`);
    expect(status).toHaveClass('sr-only');
    expect(
      screen.getByText(/Each run replaces the table/, { selector: 'p.text-warning' })
    ).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Plan 2026' });
    expect(link.getAttribute('href')).toMatch(/\/data-marts\/dm-2\/data-setup$/);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not say the table is replaced for a connector that merges rows', () => {
    render(
      <TargetSetupStepHarness
        dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
        conflict={{ conflict: true, dataMart: { id: 'dm-2', title: 'Ads 2026' } }}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `Already used by Ads 2026. ${SHARED_TABLE}`
    );
    expect(screen.queryByText(/replaces the table/)).toBeNull();
  });

  it('says another Data Mart when the member cannot see it', () => {
    render(
      <TargetSetupStepHarness
        dataStorageType={DataStorageType.GOOGLE_BIGQUERY}
        conflict={{ conflict: true, dataMart: null }}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      `Already used by another Data Mart. ${SHARED_TABLE}`
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
    expect(screen.queryByText(/Already used by/)).toBeNull();
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
