import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { McpConnectorsFacadeImpl } from './mcp-connectors.facade.impl';
import { McpConnectorMapper } from '../mappers/mcp-connector.mapper';
import { ConnectorMapper } from '../mappers/connector.mapper';
import type { AuthorizationContext } from '../../idp';
import { ConnectorPreviewCredentialsService } from '../services/connector/connector-preview-credentials.service';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { SourceCredentialUnavailableException } from '../exceptions/source-credential-unavailable.exception';

const actor: AuthorizationContext = { projectId: 'project', userId: 'user', roles: ['editor'] };

function fixture() {
  const list = {
    run: jest.fn().mockResolvedValue([
      {
        name: 'Sheets',
        title: 'Sheets',
        description: null,
        docUrl: null,
        logo: 'huge',
        secret: 'never',
      },
    ]),
  };
  const specification = {
    run: jest.fn().mockResolvedValue([
      { name: 'Limit', default: 25, oauthParams: { secret: 'never' } },
      {
        name: 'Token',
        attributes: ['SECRET'],
        default: 'never',
        options: ['never'],
        placeholder: 'never',
      },
      {
        name: 'Auth',
        oneOf: [
          {
            label: 'Key',
            value: 'key',
            attributes: ['SECRET'],
            oauthParams: { secret: 'never' },
            items: { Key: { name: 'Key', default: 'never' } },
          },
        ],
      },
    ]),
  };
  const fields = {
    run: jest.fn().mockResolvedValue([
      {
        name: 'items',
        fields: [{ name: 'id', type: 'string', secret: 'never' }],
        secret: 'never',
      },
    ]),
  };
  const previewFields = {
    run: jest.fn().mockResolvedValue([{ name: 'sheet', fields: [{ name: 'id' }] }]),
  };
  const previewOptions = {
    run: jest.fn().mockResolvedValue([{ value: 'id', label: 'Sheet', secret: 'never' }]),
  };
  const configuration = { assertNonSecretConfiguration: jest.fn().mockResolvedValue(undefined) };
  const facade = new McpConnectorsFacadeImpl(
    list as never,
    specification as never,
    fields as never,
    previewFields as never,
    previewOptions as never,
    configuration as never,
    new McpConnectorMapper(new ConnectorMapper())
  );
  return { facade, list, specification, fields, previewFields, previewOptions, configuration };
}

describe('McpConnectorsFacadeImpl', () => {
  it('allowlists catalog, specification, and static field DTOs', async () => {
    const f = fixture();
    expect(await f.facade.list()).toEqual([
      { name: 'Sheets', title: 'Sheets', description: null, docUrl: null },
    ]);
    expect(JSON.stringify(await f.facade.getSpecification('Sheets'))).not.toContain('never');
    expect(await f.facade.getFields('Sheets')).toEqual([
      { name: 'items', fields: [{ name: 'id', type: 'string' }] },
    ]);
  });

  it('validates non-secret preview configuration before resolving its saved Credential', async () => {
    const f = fixture();
    expect(
      await f.facade.previewFields(actor, {
        connectorName: 'Sheets',
        configuration: { SpreadsheetId: 'sheet' },
        credentialId: 'credential',
      })
    ).toEqual([{ name: 'sheet', fields: [{ name: 'id' }] }]);
    expect(f.configuration.assertNonSecretConfiguration).toHaveBeenCalledWith('project', 'Sheets', {
      SpreadsheetId: 'sheet',
    });
    expect(f.previewFields.run).toHaveBeenCalledWith(
      actor,
      'Sheets',
      {
        SpreadsheetId: 'sheet',
        _credential_id: 'credential',
      },
      undefined
    );
    expect(
      await f.facade.previewFieldOptions(actor, {
        connectorName: 'Sheets',
        field: 'SheetName',
        configuration: {},
        credentialId: 'credential',
      })
    ).toEqual([{ value: 'id', label: 'Sheet' }]);
  });

  it.each([
    { dataMartId: 'bound-dm', canEdit: true, allowed: true },
    { dataMartId: 'other-dm', canEdit: true, allowed: false },
    { dataMartId: 'bound-dm', canEdit: false, allowed: false },
  ])(
    'uses the shared bound-Credential preview permissions: %p',
    async ({ dataMartId, canEdit, allowed }) => {
      const f = fixture();
      const credentials = {
        boundCredentialIds: jest
          .fn()
          .mockImplementation(
            async (_projectId, id) => new Map(id === 'bound-dm' ? [['config', 'credential']] : [])
          ),
        hasCredential: jest.fn().mockResolvedValue(true),
        assertCanUseCredential: jest
          .fn()
          .mockRejectedValue(new ForbiddenException('Credential USE denied')),
        resolveCredential: jest.fn().mockResolvedValue({ credentialId: 'credential' }),
      };
      const previewCredentials = new ConnectorPreviewCredentialsService(
        {} as never,
        {} as never,
        { canAccess: jest.fn().mockResolvedValue(canEdit) } as never,
        credentials as never,
        { previewBoundConfig: jest.fn().mockImplementation(config => config) } as never
      );
      f.previewFields.run.mockImplementation(async (context, name, config, id) => {
        await previewCredentials.inject(name, config, context, id);
        return [];
      });
      f.previewOptions.run.mockImplementation(async (context, name, _field, config, id) => {
        await previewCredentials.inject(name, config, context, id);
        return [];
      });
      const input = {
        connectorName: 'Sheets',
        credentialId: 'credential',
        dataMartId,
        configurationId: 'config',
        configuration: { SpreadsheetId: 'sheet' },
      };
      for (const preview of [
        () => f.facade.previewFields(actor, input),
        () => f.facade.previewFieldOptions(actor, { ...input, field: 'SheetName' }),
      ]) {
        if (allowed) {
          await expect(preview()).resolves.toEqual([]);
          expect(credentials.assertCanUseCredential).not.toHaveBeenCalled();
          expect(credentials.resolveCredential).toHaveBeenCalledWith('project', 'credential');
        } else {
          await expect(preview()).rejects.toMatchObject({ status: 403 });
          expect(credentials.resolveCredential).not.toHaveBeenCalled();
        }
      }
      expect(credentials.boundCredentialIds).toHaveBeenCalledWith('project', dataMartId);
    }
  );

  it.each(['_credential_id', '_id'])(
    'rejects internal preview configuration reference %s',
    async key => {
      const f = fixture();
      await expect(
        f.facade.previewFields(actor, {
          connectorName: 'Sheets',
          configuration: { [key]: 'reference' },
        })
      ).rejects.toMatchObject({ status: 400 });
      expect(f.previewFields.run).not.toHaveBeenCalled();
    }
  );

  it('never probes when secret validation fails', async () => {
    const f = fixture();
    f.configuration.assertNonSecretConfiguration.mockRejectedValue(
      new BadRequestException('secret in validator')
    );
    await expect(
      f.facade.previewFields(actor, { connectorName: 'Sheets', configuration: { Token: 'raw' } })
    ).rejects.toThrow('Unable to preview connector fields');
    expect(f.previewFields.run).not.toHaveBeenCalled();
  });

  it.each(['fields', 'field options'])(
    'returns safe Credential recovery guidance for %s preview',
    async preview => {
      const f = fixture();
      const failure = new SourceCredentialUnavailableException('private-credential provider-token');
      f.previewFields.run.mockRejectedValue(failure);
      f.previewOptions.run.mockRejectedValue(failure);
      const input = { connectorName: 'Sheets', credentialId: 'credential', configuration: {} };
      const result =
        preview === 'fields'
          ? f.facade.previewFields(actor, input)
          : f.facade.previewFieldOptions(actor, { ...input, field: 'SheetName' });

      await expect(result).rejects.toMatchObject({
        status: 400,
        message: expect.stringContaining('The saved Credential is unavailable.'),
      });
      await expect(result).rejects.toThrow('Credentials page in OWOX');
      expect(JSON.stringify(await result.catch(error => error))).not.toMatch(
        /private-credential|provider-token/
      );
    }
  );

  it.each([
    { error: new ForbiddenException('provider-token'), status: 403 },
    { error: new BusinessViolationException('provider-token'), status: 400 },
    { error: new Error('provider-token'), status: 500 },
  ])('sanitizes credential and provider failures', async ({ error, status }) => {
    const f = fixture();
    f.previewOptions.run.mockRejectedValue(error);
    try {
      await f.facade.previewFieldOptions(actor, {
        connectorName: 'Sheets',
        field: 'SheetName',
        configuration: {},
      });
    } catch (failure) {
      expect(JSON.stringify(failure)).not.toContain('provider-token');
    }
    await expect(
      f.facade.previewFieldOptions(actor, {
        connectorName: 'Sheets',
        field: 'SheetName',
        configuration: {},
      })
    ).rejects.toMatchObject({ status });
  });
});
