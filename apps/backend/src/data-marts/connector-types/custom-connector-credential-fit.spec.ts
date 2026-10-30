import { CUSTOM_CONNECTOR_DEFINITION_ID } from './source-credential-definitions';
import type { CustomConnectorPublicMetadata } from '../credentials/credential.types';
import {
  customConnectorConfigRefusal,
  customConnectorCredentialRequirement,
  customConnectorRefusal,
  fitCustomConnectorCredential,
  selectionOf,
} from './custom-connector-credential-fit';
import { customConnectorKeyModel } from './custom-connector-key-model';

const model = {
  allowedHosts: ['api.acme.example', 'auth.acme.example'],
  keyParameters: ['ClientId', 'ClientSecret', 'GeneratedRefreshToken'],
  keyParameterBranches: null,
  keyParameterMisuse: [],
  parameters: {
    ClientId: { isRequired: true },
    ClientSecret: { isRequired: true },
    GeneratedRefreshToken: { isRequired: false },
    AccountId: { isRequired: true },
  },
};

function credential(
  hosts: string[],
  keys: string[],
  fields: Record<string, string> = {}
): CustomConnectorPublicMetadata {
  return {
    hosts,
    fieldList: keys.map(key => ({ key, label: key, secret: key !== 'ClientId' })),
    fields,
  };
}

describe('fitCustomConnectorCredential', () => {
  it('fits when hosts and key parameters are covered', () => {
    expect(
      fitCustomConnectorCredential(
        model,
        credential(
          ['api.acme.example', 'AUTH.acme.example', 'other.example'],
          ['ClientId', 'ClientSecret']
        )
      )
    ).toEqual({ fits: true, reasons: [] });
  });

  it('compares hosts without case on bare hostnames', () => {
    expect(
      fitCustomConnectorCredential(
        { ...model, allowedHosts: ['API.Acme.Example', 'auth.acme.example'] },
        credential(['api.acme.example', 'auth.acme.example'], ['ClientId', 'ClientSecret'])
      )
    ).toEqual({ fits: true, reasons: [] });
  });

  it('does not fit a missing host', () => {
    expect(
      fitCustomConnectorCredential(
        model,
        credential(['api.acme.example'], ['ClientId', 'ClientSecret'])
      )
    ).toEqual({ fits: false, reasons: ['host'] });
  });

  it('does not fit a missing required key parameter', () => {
    expect(
      fitCustomConnectorCredential(
        model,
        credential(['api.acme.example', 'auth.acme.example'], ['ClientSecret'], {
          ClientId: 'in-values-only',
        })
      )
    ).toEqual({ fits: false, reasons: ['field'] });
  });

  it('never requires an optional key parameter such as GeneratedRefreshToken', () => {
    expect(
      fitCustomConnectorCredential(
        {
          ...model,
          parameters: { ...model.parameters, ClientSecret: {} },
        },
        credential(['api.acme.example', 'auth.acme.example'], ['ClientId'])
      )
    ).toEqual({ fits: true, reasons: [] });
  });

  describe('selective authentication', () => {
    const selective = {
      ...model,
      keyParameters: ['ApiKey', 'ClientId', 'ClientSecret', 'GeneratedRefreshToken'],
      keyParameterBranches: {
        apiKey: ['ApiKey', 'GeneratedRefreshToken'],
        oauth: ['ClientId', 'ClientSecret', 'GeneratedRefreshToken'],
      },
      parameters: { ...model.parameters, ApiKey: { isRequired: true } },
    };
    const hosts = ['api.acme.example', 'auth.acme.example'];

    it('checks the selected selective branch only', () => {
      const apiKeyOnly = credential(hosts, ['ApiKey']);

      expect(fitCustomConnectorCredential(selective, apiKeyOnly, 'apiKey')).toEqual({
        fits: true,
        reasons: [],
      });
      expect(fitCustomConnectorCredential(selective, apiKeyOnly, 'oauth')).toEqual({
        fits: false,
        reasons: ['field'],
      });
    });

    it('does not fit without a selection or with an unknown one', () => {
      const everything = credential(hosts, ['ApiKey', 'ClientId', 'ClientSecret']);

      expect(fitCustomConnectorCredential(selective, everything)).toEqual({
        fits: false,
        reasons: ['field'],
      });
      expect(fitCustomConnectorCredential(selective, everything, 'basic')).toEqual({
        fits: false,
        reasons: ['field'],
      });
    });
  });

  it('reports misuse', () => {
    expect(
      fitCustomConnectorCredential(
        {
          ...model,
          keyParameterMisuse: [
            { parameter: 'ClientSecret', node: 'orders', position: 'transformations.add' },
          ],
        },
        credential(['api.acme.example'], [])
      )
    ).toEqual({ fits: false, reasons: ['host', 'field', 'misuse'] });
  });
});

describe('customConnectorRefusal', () => {
  const hosts = ['api.acme.example', 'auth.acme.example'];
  const custom = (metadata: CustomConnectorPublicMetadata | null) => ({
    definitionId: CUSTOM_CONNECTOR_DEFINITION_ID,
    publicMetadata: metadata,
  });
  const fitting = credential(hosts, ['ClientId', 'ClientSecret']);

  it('is null for a fitting custom connector Credential', () => {
    expect(customConnectorRefusal(model, custom(fitting))).toBeNull();
  });

  it('refuses another definition', () => {
    expect(
      customConnectorRefusal(model, { definitionId: 'google-ads', publicMetadata: fitting })
    ).toEqual({ kind: 'other-definition' });
  });

  it('refuses metadata that is not a custom connector one', () => {
    expect(customConnectorRefusal(model, custom(null))).toEqual({ kind: 'other-definition' });
    expect(
      customConnectorRefusal(model, {
        definitionId: CUSTOM_CONNECTOR_DEFINITION_ID,
        publicMetadata: { fields: {} },
      })
    ).toEqual({ kind: 'other-definition' });
  });

  it('refuses an unfit Credential', () => {
    expect(customConnectorRefusal(model, custom(credential(hosts, ['ClientId'])))).toEqual({
      kind: 'unfit',
    });
  });

  it('names the misuse even when the Credential would otherwise fit', () => {
    const misused = {
      ...model,
      keyParameterMisuse: [
        { parameter: 'ClientSecret', node: 'orders', position: 'transformations.add' },
      ],
    };
    expect(customConnectorRefusal(misused, custom(fitting))).toEqual({
      kind: 'misuse',
      message:
        'Key parameter "ClientSecret" cannot be used in transformations.add of node "orders"',
    });
  });

  it('fits the selection given, and the configuration selection through its default', () => {
    const selective = {
      ...model,
      keyParameterBranches: { apiKey: ['ApiKey'], oauth: ['ClientId', 'ClientSecret'] },
      parameters: {
        ...model.parameters,
        ApiKey: { isRequired: true },
        AuthType: { default: 'oauth' },
      },
      authentication: { selectionParameter: 'AuthType' },
    };
    expect(customConnectorRefusal(selective, custom(fitting), 'apiKey')).toEqual({ kind: 'unfit' });
    expect(customConnectorRefusal(selective, custom(fitting), 'oauth')).toBeNull();
    expect(customConnectorConfigRefusal(selective, custom(fitting), {})).toBeNull();
    expect(
      customConnectorConfigRefusal(selective, custom(fitting), { AuthType: ' apiKey ' })
    ).toEqual({
      kind: 'unfit',
    });
  });
});

describe('selectionOf', () => {
  const selecting = (parameter: Record<string, unknown> = {}) => ({
    ...model,
    authentication: { selectionParameter: 'AuthType' },
    parameters: { ...model.parameters, AuthType: parameter },
  });

  it('reads the configuration value, trimmed as the engine reads it', () => {
    expect(selectionOf(selecting({ default: 'key' }), { AuthType: ' oauth2 ' })).toBe('oauth2');
  });

  it("takes the parameter's default for a missing, null or empty value, as the engine does", () => {
    for (const config of [{}, { AuthType: null }, { AuthType: '' }, { AuthType: '  ' }]) {
      expect(selectionOf(selecting({ default: 'key' }), config)).toBe('key');
    }
  });

  it('is undefined without a selection parameter, a text value or a default', () => {
    expect(selectionOf(model, { AuthType: 'key' })).toBeUndefined();
    expect(selectionOf(selecting(), {})).toBeUndefined();
    expect(selectionOf(selecting({ default: 'key' }), { AuthType: 1 })).toBeUndefined();
  });
});

describe('customConnectorCredentialRequirement', () => {
  const selectiveManifest = {
    version: '1.0',
    name: 'AcmeApi',
    baseUrl: 'https://api.acme.example',
    authentication: {
      type: 'selective',
      selectionParameter: 'AuthType',
      authenticators: {
        key: {
          type: 'apiKey',
          inject: { into: 'query', name: 'k', format: '{{ parameters.ApiKey }}' },
        },
        oauth2: {
          type: 'oauth2',
          tokenUrl: 'https://oauth.acme.example/token',
          clientId: '{{ parameters.ClientId }}',
          clientSecret: '{{ parameters.ClientSecret }}',
          refreshToken: '{{ parameters.RefreshToken }}',
          inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
        },
      },
    },
    parameters: {
      AuthType: { requiredType: 'string' },
      ApiKey: { requiredType: 'string', isRequired: true, label: 'API Key' },
      ClientId: { requiredType: 'string', isRequired: true, label: 'Client ID' },
      ClientSecret: { requiredType: 'string', isRequired: true },
      RefreshToken: { requiredType: 'string', isRequired: true, label: 'Refresh Token' },
    },
    nodes: {
      items: {
        destinationName: 'items',
        isTimeSeries: false,
        uniqueKeys: ['id'],
        fields: { id: { type: 'string' } },
        request: { method: 'GET', path: '/items' },
        recordSelector: { recordPath: ['data'] },
      },
    },
  };

  it("credential-requirement returns hosts and the selected branch's key fields without values", () => {
    const model = customConnectorKeyModel(selectiveManifest);
    const requirement = customConnectorCredentialRequirement(model, 'oauth2');

    expect(requirement).toEqual({
      hosts: ['api.acme.example', 'oauth.acme.example'],
      fieldList: [
        { key: 'ClientId', label: 'Client ID', secret: false, required: true },
        { key: 'ClientSecret', label: 'ClientSecret', secret: true, required: true },
        { key: 'RefreshToken', label: 'Refresh Token', secret: true, required: true },
      ],
      keyParameters: expect.arrayContaining(['ApiKey', 'ClientId', 'ClientSecret', 'RefreshToken']),
      selectionParameter: 'AuthType',
      misuse: [],
    });
    // An optional generated key never asks for a value.
    expect(requirement.keyParameters).toContain('GeneratedRefreshToken');
    expect(requirement.fieldList.map(field => field.key)).not.toContain('GeneratedRefreshToken');
    // No branch selected: nothing fits, so nothing is asked for yet.
    expect(customConnectorCredentialRequirement(model, 'basic').fieldList).toEqual([]);
  });

  it('fieldList includes optional key parameters and excludes generated ones', () => {
    const { authentication } = selectiveManifest;
    const model = customConnectorKeyModel({
      ...selectiveManifest,
      authentication: authentication.authenticators.oauth2,
      parameters: {
        ClientId: { requiredType: 'string', isRequired: true, label: 'Client ID' },
        ClientSecret: { requiredType: 'string', isRequired: true, label: 'Client Secret' },
        RefreshToken: { requiredType: 'string', isRequired: true, label: 'Refresh Token' },
        Region: { requiredType: 'string', label: 'Region', attributes: ['SECRET'] },
      },
    });

    expect(model.keyParameters).toContain('GeneratedRefreshToken');
    expect(customConnectorCredentialRequirement(model).fieldList).toEqual([
      { key: 'ClientId', label: 'Client ID', secret: false, required: true },
      { key: 'ClientSecret', label: 'Client Secret', secret: true, required: true },
      { key: 'RefreshToken', label: 'Refresh Token', secret: true, required: true },
      { key: 'Region', label: 'Region', secret: true, required: false },
    ]);
  });
});
