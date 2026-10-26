import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StorageCredentialStateMark } from './StorageCredentialStateMark';

describe('StorageCredentialStateMark', () => {
  it.each([
    ['disabled', 'Credential disabled'],
    ['reconnect-required', 'Reconnect the Credential'],
    ['reauthorize-required', 'Reconnect the Credential to grant permissions'],
  ] as const)('names what a %s Credential needs', (state, text) => {
    render(
      <StorageCredentialStateMark
        summary={{
          access: 'visible',
          id: 'c',
          title: 'Key',
          definitionId: 'google-oauth',
          providerName: 'Google',
          identity: null,
          state,
        }}
      />
    );

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each([
    ['disabled', "Ask the Credential's owner to enable it"],
    ['reconnect-required', "Ask the Credential's owner to reconnect it"],
    ['reauthorize-required', "Ask the Credential's owner to reconnect it"],
  ] as const)('tells a member who cannot see a %s Credential who can fix it', (state, text) => {
    render(<StorageCredentialStateMark summary={{ access: 'restricted', state }} />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('says Google sign-in is missing to everyone', () => {
    render(
      <>
        <StorageCredentialStateMark summary={{ access: 'restricted', state: 'not-configured' }} />
        <StorageCredentialStateMark
          summary={{
            access: 'visible',
            id: 'c',
            title: 'Key',
            definitionId: 'google-oauth',
            providerName: 'Google',
            identity: null,
            state: 'not-configured',
          }}
        />
      </>
    );

    expect(screen.getAllByText('Google sign-in is not configured on this server')).toHaveLength(2);
  });

  it('says nothing about a ready or missing Credential, or a Storage on its own key', () => {
    const { container } = render(
      <>
        <StorageCredentialStateMark summary={{ access: 'restricted', state: 'ready' }} />
        <StorageCredentialStateMark summary={null} />
        <StorageCredentialStateMark summary={{ access: 'pending', state: 'ready' }} />
      </>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
