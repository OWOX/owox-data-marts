import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CredentialDefinitionField } from '../types';
import { CredentialFieldsInputs } from './CredentialFieldsInputs';

const fields: CredentialDefinitionField[] = [
  {
    key: 'username',
    label: 'Username',
    input: 'text',
    secret: false,
    required: true,
    identity: true,
  },
  {
    key: 'password',
    label: 'Password',
    input: 'password',
    secret: true,
    required: true,
    identity: false,
  },
  {
    key: 'privateKey',
    label: 'Private key',
    input: 'multiline',
    secret: true,
    required: false,
    identity: false,
  },
];

describe('CredentialFieldsInputs', () => {
  it('renders each field by its input kind', () => {
    render(
      <CredentialFieldsInputs
        fields={fields}
        values={{ username: '', password: '', privateKey: '' }}
        isEditing={false}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Username')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Private key').tagName).toBe('TEXTAREA');
    expect(screen.getByTestId('credentialFieldPrivateKey')).toBe(
      screen.getByLabelText('Private key')
    );
  });

  it('shows the replace placeholder on saved secret fields only when editing', () => {
    const { rerender } = render(
      <CredentialFieldsInputs
        fields={fields}
        values={{ username: 'ann', password: '', privateKey: '' }}
        isEditing
        setSecretKeys={['password', 'privateKey']}
        onChange={vi.fn()}
      />
    );
    const placeholder = 'Saved. Enter a new value to replace it.';
    expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', placeholder);
    expect(screen.getByLabelText('Private key')).toHaveAttribute('placeholder', placeholder);
    expect(screen.getByLabelText('Username')).not.toHaveAttribute('placeholder', placeholder);

    rerender(
      <CredentialFieldsInputs
        fields={fields}
        values={{ username: 'ann', password: '', privateKey: '' }}
        isEditing={false}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('placeholder', placeholder);
  });

  it('reports the typed value with its key and shows errors', () => {
    const onChange = vi.fn();
    render(
      <CredentialFieldsInputs
        fields={fields}
        values={{ username: '', password: '', privateKey: '' }}
        errors={{ username: 'Username is required' }}
        isEditing={false}
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ann' } });

    expect(onChange).toHaveBeenCalledWith('username', 'ann');
    expect(screen.getByText('Username is required')).toBeInTheDocument();
  });

  it('says Saved and offers Remove only for secrets that are set', () => {
    const onToggleRemove = vi.fn();
    render(
      <CredentialFieldsInputs
        fields={fields}
        values={{ username: 'ann', password: '', privateKey: '' }}
        isEditing
        setSecretKeys={['password']}
        onToggleRemove={onToggleRemove}
        onChange={vi.fn()}
      />
    );
    const placeholder = 'Saved. Enter a new value to replace it.';
    expect(screen.getByLabelText('Password')).toHaveAttribute('placeholder', placeholder);
    expect(screen.getByLabelText('Private key')).not.toHaveAttribute('placeholder', placeholder);
    expect(screen.queryByRole('button', { name: 'Remove Private key' })).toBeNull();

    render(
      <CredentialFieldsInputs
        fields={fields}
        values={{ username: 'ann', password: '', privateKey: '' }}
        isEditing
        setSecretKeys={['privateKey']}
        onToggleRemove={onToggleRemove}
        onChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove Private key' }));
    expect(onToggleRemove).toHaveBeenCalledWith('privateKey');
  });

  it('shows each field in a card with the help of its provider', () => {
    render(
      <CredentialFieldsInputs
        definitionId='snowflake-password'
        fields={fields.slice(0, 2)}
        values={{ username: '', password: '' }}
        isEditing={false}
        onChange={vi.fn()}
      />
    );
    const username = screen.getByLabelText('Username');
    const card = username.closest<HTMLElement>('[data-slot="form-item"]');

    expect(card).not.toBeNull();
    expect(username).toHaveAttribute('placeholder', 'Enter username');
    expect(within(card!).getByRole('button', { name: 'Help information' })).toBeInTheDocument();
    expect(within(card!).getByText('How do I find my Snowflake username?')).toBeInTheDocument();
    expect(screen.getByText('How do I manage my Snowflake PAT?')).toBeInTheDocument();
  });

  it('says under the AWS session token when it is needed', () => {
    render(
      <CredentialFieldsInputs
        definitionId='aws-access-key'
        fields={[
          {
            key: 'sessionToken',
            label: 'Session token',
            input: 'password',
            secret: true,
            required: false,
            identity: false,
          },
        ]}
        values={{ sessionToken: '' }}
        isEditing={false}
        onChange={vi.fn()}
      />
    );

    expect(
      within(
        screen.getByLabelText('Session token').closest<HTMLElement>('[data-slot="form-item"]')!
      ).getByText('Needed only for temporary credentials, whose Access Key ID starts with ASIA.')
    ).toBeInTheDocument();
  });

  it('keeps a field with no help in a card', () => {
    render(
      <CredentialFieldsInputs
        fields={fields.slice(0, 1)}
        values={{ username: '' }}
        isEditing={false}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Username').closest('[data-slot="form-item"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Help information' })).toBeNull();
  });

  it('links the error to its input', () => {
    render(
      <CredentialFieldsInputs
        fields={fields}
        values={{ username: '', password: '', privateKey: '' }}
        errors={{ username: 'Username is required' }}
        isEditing={false}
        onChange={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Username');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(
      screen.getByText('Username is required').id
    );
  });
});
