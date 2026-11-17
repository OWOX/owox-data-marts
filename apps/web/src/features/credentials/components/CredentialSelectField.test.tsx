import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Credential } from '../types';
import type { CredentialConfigSheetProps } from './CredentialConfigSheet';
import { CredentialSelectField } from './CredentialSelectField';

const credentialsState = vi.hoisted(() => ({
  credentials: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const definitionsState = vi.hoisted(() => ({
  definitions: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const sheet = vi.hoisted(() => ({ props: null as null | CredentialConfigSheetProps }));

vi.mock('../useCredentials', () => ({
  useCredentials: () => credentialsState,
  useCredentialDefinitions: () => definitionsState,
}));

vi.mock('./CredentialConfigSheet', () => ({
  CredentialConfigSheet: (props: CredentialConfigSheetProps) => {
    sheet.props = props;
    return null;
  },
}));

const FIBERY_LOGO = 'data:image/png;base64,AAAA';

function credential(
  id: string,
  title: string,
  definitionId: string,
  definition: Record<string, unknown> = {}
): Credential {
  return {
    id,
    title,
    definition: { id: definitionId, displayName: 'Provider', ...definition },
    enabled: true,
    canUse: true,
    identity: null,
  } as Credential;
}

function renderField(props: Partial<Parameters<typeof CredentialSelectField>[0]> = {}) {
  const onChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <CredentialSelectField
      allowedDefinitionIds={['google-sheets-oauth', 'google-service-account']}
      isNew
      value={null}
      summary={null}
      onChange={onChange}
      onCreated={onCreated}
      {...props}
    />
  );
  return { onChange, onCreated };
}

describe('CredentialSelectField', () => {
  beforeEach(() => {
    credentialsState.credentials = [];
    credentialsState.isLoading = false;
    credentialsState.isError = false;
    definitionsState.definitions = [
      { id: 'google-sheets-oauth' },
      { id: 'google-service-account' },
      { id: 'google-chat-webhook' },
    ];
    definitionsState.isLoading = false;
    definitionsState.isError = false;
    sheet.props = null;
  });

  it('offers only Credentials of the allowed definitions', () => {
    credentialsState.credentials = [
      credential('a', 'Sheets account', 'google-sheets-oauth'),
      credential('b', 'Chat room', 'google-chat-webhook'),
      credential('c', 'Sheets key', 'google-service-account'),
    ];
    renderField();

    fireEvent.click(screen.getByRole('combobox', { name: 'Credential' }));
    const names = within(document.body)
      .getAllByRole('option')
      .map(option => option.textContent);
    expect(names).toEqual([
      expect.stringContaining('Sheets account'),
      expect.stringContaining('Sheets key'),
      '+ Create new Credential',
    ]);
  });

  it('selects the only fitting Credential once for a new entity, as an auto choice', () => {
    credentialsState.credentials = [
      credential('a', 'Chat room', 'google-chat-webhook'),
      credential('b', 'Sheets account', 'google-sheets-oauth'),
    ];
    const { onChange } = renderField();

    expect(onChange).toHaveBeenCalledExactlyOnceWith('b', 'auto');
  });

  it('does not select anything for an entity that already has a binding', () => {
    credentialsState.credentials = [credential('b', 'Sheets account', 'google-sheets-oauth')];
    const { onChange } = renderField({ isNew: false });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens the create sheet with the allowed definitions, not shared', () => {
    renderField({ allowedDefinitionIds: ['google-chat-webhook'] });

    fireEvent.click(screen.getByRole('combobox', { name: 'Credential' }));
    fireEvent.click(screen.getByRole('option', { name: '+ Create new Credential' }));

    expect(sheet.props).toMatchObject({
      credential: null,
      allowedDefinitionIds: ['google-chat-webhook'],
      initialDefinitionId: 'google-chat-webhook',
      defaultSharing: 'not-shared',
    });
  });

  it('selects the created Credential and reports it', () => {
    const { onChange, onCreated } = renderField({ allowedDefinitionIds: ['google-chat-webhook'] });
    fireEvent.click(screen.getByRole('combobox', { name: 'Credential' }));
    fireEvent.click(screen.getByRole('option', { name: '+ Create new Credential' }));

    const created = credential('new', 'Chat room', 'google-chat-webhook');
    sheet.props?.onCreated?.(created);

    expect(onCreated).toHaveBeenCalledWith(created);
    expect(onChange).toHaveBeenCalledWith('new', 'created');
  });

  describe('custom connector Credentials', () => {
    const custom = () =>
      credential('cc', 'Fibery key', 'custom-connector', {
        auth: { type: 'custom-connector' },
        category: 'custom-connectors',
      });

    it('shows the connector logo on Custom connector Credentials', () => {
      credentialsState.credentials = [custom()];
      renderField({
        allowedDefinitionIds: ['custom-connector'],
        value: 'cc',
        connectorLogo: FIBERY_LOGO,
      });

      const trigger = screen.getByRole('combobox', { name: 'Credential' });
      expect(trigger.querySelector(`img[src="${FIBERY_LOGO}"]`)).not.toBeNull();
      fireEvent.click(trigger);
      const option = within(document.body).getByRole('option', { name: /Fibery key/ });
      expect(option.querySelector(`img[src="${FIBERY_LOGO}"]`)).not.toBeNull();
    });

    it('does not show the connector logo on a built-in Credential in the same list', () => {
      credentialsState.credentials = [
        custom(),
        credential('b', 'GitHub key', 'github', { icon: 'github', category: 'other' }),
      ];
      renderField({
        allowedDefinitionIds: ['custom-connector', 'github'],
        connectorLogo: FIBERY_LOGO,
      });

      fireEvent.click(screen.getByRole('combobox', { name: 'Credential' }));
      const builtIn = within(document.body).getByRole('option', { name: /GitHub key/ });
      expect(builtIn.querySelector(`img[src="${FIBERY_LOGO}"]`)).toBeNull();
      const option = within(document.body).getByRole('option', { name: /Fibery key/ });
      expect(option.querySelector(`img[src="${FIBERY_LOGO}"]`)).not.toBeNull();
    });

    it('shows the Plug icon on Custom connector Credentials without a connector logo', () => {
      credentialsState.credentials = [custom()];
      renderField({ allowedDefinitionIds: ['custom-connector'], value: 'cc' });

      const trigger = screen.getByRole('combobox', { name: 'Credential' });
      expect(trigger.querySelector('.lucide-plug')).not.toBeNull();
      fireEvent.click(trigger);
      const option = within(document.body).getByRole('option', { name: /Fibery key/ });
      expect(option.querySelector('.lucide-plug')).not.toBeNull();
    });
  });
});
