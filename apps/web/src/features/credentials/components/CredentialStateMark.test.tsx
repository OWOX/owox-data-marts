import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CredentialStateMark } from './CredentialStateMark';

describe('CredentialStateMark', () => {
  it.each([
    ['disabled', 'Credential disabled'],
    ['reconnect-required', 'Reconnect the Credential'],
    ['reauthorize-required', 'Reconnect the Credential to grant permissions'],
  ] as const)('names what a %s Credential needs', (state, text) => {
    render(
      <CredentialStateMark
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
    render(<CredentialStateMark summary={{ access: 'restricted', state }} />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('says Google sign-in is missing to everyone', () => {
    render(
      <>
        <CredentialStateMark summary={{ access: 'restricted', state: 'not-configured' }} />
        <CredentialStateMark
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

  it('says nothing about a ready or missing Credential, or a consumer on its own key', () => {
    const { container } = render(
      <>
        <CredentialStateMark summary={{ access: 'restricted', state: 'ready' }} />
        <CredentialStateMark summary={null} />
        <CredentialStateMark summary={{ access: 'pending', state: 'ready' }} />
      </>
    );

    expect(container).toBeEmptyDOMElement();
  });
});
