import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SECRET_MASK } from '../../../../../../../shared/constants/secrets';
import { GoogleSheetsServiceAccountField } from './GoogleSheetsServiceAccountField';

const metadata = {
  email: 'reader@test-project.iam.gserviceaccount.com',
  clientId: '123456789',
  projectId: 'test-project',
};
const serviceAccountKey = JSON.stringify({
  ...metadata,
  client_email: metadata.email,
  client_id: metadata.clientId,
  project_id: metadata.projectId,
  private_key: 'private-key',
});
function StatefulField() {
  const [currentValue, setCurrentValue] = useState('');
  const [currentMetadata, setCurrentMetadata] = useState({});
  return (
    <GoogleSheetsServiceAccountField
      itemName='ServiceAccountKey'
      value={currentValue}
      metadata={currentMetadata}
      onValueChange={(nextValue, nextMetadata) => {
        setCurrentValue(nextValue);
        setCurrentMetadata(nextMetadata);
      }}
      isEditingExisting={false}
    />
  );
}

describe('GoogleSheetsServiceAccountField', () => {
  it('summarizes valid JSON and allows it to be cleared', () => {
    render(<StatefulField />);
    fireEvent.change(screen.getByPlaceholderText(/Paste your service account JSON/i), {
      target: { value: serviceAccountKey },
    });

    expect(screen.getByRole('link', { name: metadata.email })).toBeInTheDocument();
    expect(screen.queryByDisplayValue(serviceAccountKey)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByPlaceholderText(/Paste your service account JSON/i)).toHaveValue('');
  });

  it('keeps incomplete JSON editable', () => {
    render(<StatefulField />);
    const incompleteKey = JSON.stringify({ client_email: metadata.email });
    fireEvent.change(screen.getByPlaceholderText(/Paste your service account JSON/i), {
      target: { value: incompleteKey },
    });

    expect(screen.getByPlaceholderText(/Paste your service account JSON/i)).toHaveValue(
      incompleteKey
    );
    expect(screen.queryByRole('link', { name: metadata.email })).not.toBeInTheDocument();
  });

  it('shows credential metadata supplied after copying configuration', () => {
    const onValueChange = () => undefined;
    const { rerender } = render(
      <GoogleSheetsServiceAccountField
        itemName='ServiceAccountKey'
        value=''
        metadata={{}}
        onValueChange={onValueChange}
        isEditingExisting={false}
      />
    );
    rerender(
      <GoogleSheetsServiceAccountField
        itemName='ServiceAccountKey'
        value={SECRET_MASK}
        metadata={metadata}
        onValueChange={onValueChange}
        isEditingExisting={false}
      />
    );

    expect(screen.getByRole('link', { name: metadata.email })).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Paste your service account JSON/i)
    ).not.toBeInTheDocument();
  });
});
