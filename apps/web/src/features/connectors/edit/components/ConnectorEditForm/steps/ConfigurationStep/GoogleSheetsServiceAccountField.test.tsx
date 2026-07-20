import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SECRET_MASK } from '../../../../../../../shared/constants/secrets';
import { GoogleSheetsServiceAccountField } from './GoogleSheetsServiceAccountField';

const serviceAccountKey = JSON.stringify({
  type: 'service_account',
  project_id: 'test-project',
  client_id: '123456789',
  client_email: 'reader@test-project.iam.gserviceaccount.com',
  private_key: 'private-key',
});

function TestField() {
  const [value, setValue] = useState('');
  const [metadata, setMetadata] = useState({});

  return (
    <GoogleSheetsServiceAccountField
      itemName='ServiceAccountKey'
      value={value}
      metadata={metadata}
      onValueChange={(nextValue, nextMetadata) => {
        setValue(nextValue);
        setMetadata(nextMetadata);
      }}
      isEditingExisting={false}
    />
  );
}

function SavedField() {
  const [value, setValue] = useState<string>(SECRET_MASK);
  const [metadata, setMetadata] = useState<{
    email?: string;
    clientId?: string;
    projectId?: string;
  }>({
    email: 'reader@test-project.iam.gserviceaccount.com',
    clientId: '123456789',
    projectId: 'test-project',
  });

  return (
    <GoogleSheetsServiceAccountField
      itemName='ServiceAccountKey'
      value={value}
      metadata={metadata}
      onValueChange={(nextValue, nextMetadata) => {
        setValue(nextValue);
        setMetadata(nextMetadata);
      }}
      isEditingExisting
    />
  );
}

describe('GoogleSheetsServiceAccountField', () => {
  it('summarizes valid pasted JSON as the service-account email', () => {
    render(<TestField />);

    fireEvent.change(screen.getByPlaceholderText(/Paste your service account JSON/i), {
      target: { value: serviceAccountKey },
    });

    expect(
      screen.getByRole('link', { name: 'reader@test-project.iam.gserviceaccount.com' })
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue(serviceAccountKey)).not.toBeInTheDocument();
  });

  it('keeps incomplete JSON editable instead of showing a service-account summary', () => {
    render(<TestField />);
    const incompleteKey = JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      client_id: '123456789',
      client_email: 'reader@test-project.iam.gserviceaccount.com',
    });

    fireEvent.change(screen.getByPlaceholderText(/Paste your service account JSON/i), {
      target: { value: incompleteKey },
    });

    expect(screen.getByPlaceholderText(/Paste your service account JSON/i)).toHaveValue(
      incompleteKey
    );
    expect(
      screen.queryByRole('link', { name: 'reader@test-project.iam.gserviceaccount.com' })
    ).not.toBeInTheDocument();
  });

  it('shows the saved service-account email when the secret is masked', () => {
    render(<SavedField />);

    expect(
      screen.getByRole('link', { name: 'reader@test-project.iam.gserviceaccount.com' })
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue(SECRET_MASK)).not.toBeInTheDocument();
  });

  it('shows copied credential metadata when the parent replaces the editable value', () => {
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

    expect(screen.getByPlaceholderText(/Paste your service account JSON/i)).toBeInTheDocument();

    rerender(
      <GoogleSheetsServiceAccountField
        itemName='ServiceAccountKey'
        value={SECRET_MASK}
        metadata={{
          email: 'reader@test-project.iam.gserviceaccount.com',
          clientId: '123456789',
          projectId: 'test-project',
        }}
        onValueChange={onValueChange}
        isEditingExisting={false}
      />
    );

    expect(
      screen.getByRole('link', { name: 'reader@test-project.iam.gserviceaccount.com' })
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/Paste your service account JSON/i)
    ).not.toBeInTheDocument();
  });

  it('can clear a summarized key and edit the field again', () => {
    render(<TestField />);
    const input = screen.getByPlaceholderText(/Paste your service account JSON/i);
    fireEvent.change(input, { target: { value: serviceAccountKey } });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    const clearedInput = screen.getByPlaceholderText(/Paste your service account JSON/i);
    expect(clearedInput).toHaveValue('');
    fireEvent.change(clearedInput, { target: { value: 'temporary value' } });
    expect(clearedInput).toHaveValue('temporary value');
    fireEvent.change(clearedInput, { target: { value: '' } });
    expect(clearedInput).toHaveValue('');
  });

  it('can clear a previously saved key', () => {
    render(<SavedField />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByPlaceholderText(/Paste your service account JSON/i)).toHaveValue('');
    expect(
      screen.queryByRole('link', { name: 'reader@test-project.iam.gserviceaccount.com' })
    ).not.toBeInTheDocument();
  });

  it('keeps a saved key editable after clicking Edit', () => {
    render(<SavedField />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const input = screen.getByPlaceholderText(/Paste your service account JSON/i);
    expect(input).toHaveValue('');
    fireEvent.change(input, { target: { value: 'replacement key' } });
    expect(input).toHaveValue('replacement key');
  });
});
