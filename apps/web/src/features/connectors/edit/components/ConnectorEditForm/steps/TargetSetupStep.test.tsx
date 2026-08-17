import { TargetSetupStep } from './TargetSetupStep.tsx';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useState } from 'react';
import { DataStorageType } from '../../../../../data-storage';

type Target = { fullyQualifiedName: string; isValid: boolean } | null;

// Mirrors ConnectorEditForm: the target the step emits is fed straight back as a prop.
// That echo is what used to wipe the fields, so the test harness must reproduce it.
// The step renders a doc link, so it also needs a router context.
function TargetSetupStepHarness({ dataStorageType }: { dataStorageType: DataStorageType }) {
  const [target, setTarget] = useState<Target>(null);

  return (
    <MemoryRouter>
      <TargetSetupStep
        dataStorageType={dataStorageType}
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

  it('keeps the database and schema when the table name is cleared for Snowflake', () => {
    render(<TargetSetupStepHarness dataStorageType={DataStorageType.SNOWFLAKE} />);
    const databaseInput = screen.getByLabelText(/database name/i, { selector: 'input' });
    const schemaInput = screen.getByLabelText(/schema name/i, { selector: 'input' });
    const tableInput = screen.getByLabelText(/table name/i, { selector: 'input' });

    fireEvent.change(tableInput, { target: { value: '' } });

    expect(databaseInput).toHaveValue('tiktok_ads_owox');
    expect(schemaInput).toHaveValue('PUBLIC');
  });
});
