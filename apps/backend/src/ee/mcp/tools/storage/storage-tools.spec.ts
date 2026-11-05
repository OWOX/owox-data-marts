import { z } from 'zod';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccessValidationException } from '../../../../common/exceptions/access-validation.exception';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { ListStoragesTool } from './list-storages.tool';
import { GetStorageTool } from './get-storage.tool';
import { CreateStorageTool } from './create-storage.tool';
import { UpdateStorageTool } from './update-storage.tool';
import { SetStorageAccessTool } from './set-storage-access.tool';
import { ValidateStorageAccessTool } from './validate-storage-access.tool';
import { ListStorageResourcesTool } from './list-storage-resources.tool';
import { DeleteStorageTool } from './delete-storage.tool';
import type { McpAuthContext } from '../../auth/mcp-auth-context';

const context: McpAuthContext = {
  projectId: 'project',
  userId: 'user',
  roles: ['editor'],
  clientId: 'client',
  resource: 'https://mcp.example/mcp',
  scopes: ['mcp:read', 'mcp:write'],
  authFlow: 'mcp',
};
const actor = { projectId: 'project', userId: 'user', roles: ['editor'] };
const publicOrigin = { getPublicOrigin: () => 'https://app.example/' };
const storage = {
  id: 'storage',
  title: 'Storage',
  type: 'GOOGLE_BIGQUERY',
  configuration: null,
  credential: null,
  owners: [],
  contexts: [],
  availableForUse: false,
  availableForMaintenance: false,
  createdAt: '2026-11-04T00:00:00.000Z',
  modifiedAt: '2026-11-04T00:00:00.000Z',
};
const cases = [
  [ListStoragesTool, 'list', {}],
  [GetStorageTool, 'get', { storage_id: 'storage' }],
  [CreateStorageTool, 'create', { storage_type: 'GOOGLE_BIGQUERY' }],
  [UpdateStorageTool, 'update', { storage_id: 'storage', title: 'New' }],
  [SetStorageAccessTool, 'setAccess', { storage_id: 'storage', owner_ids: [] }],
  [ValidateStorageAccessTool, 'validate', { storage_id: 'storage' }],
  [ListStorageResourcesTool, 'listResources', { storage_id: 'storage', level: 'namespaces' }],
  [DeleteStorageTool, 'delete', { storage_id: 'storage' }],
] as const;

function facade() {
  return {
    list: jest.fn().mockResolvedValue([storage]),
    get: jest.fn().mockResolvedValue(storage),
    create: jest.fn().mockResolvedValue(storage),
    update: jest.fn().mockResolvedValue(storage),
    setAccess: jest.fn().mockResolvedValue(undefined),
    validate: jest.fn().mockResolvedValue({ valid: true, state: 'valid', message: 'Valid' }),
    listResources: jest.fn().mockResolvedValue({ namespaces: [{ id: 'my-project' }] }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

describe('Storage MCP tools', () => {
  it.each(cases)(
    '%s publishes a full strict schema and rejects caller identity',
    async (Tool, method, input) => {
      const api = facade();
      const tool = new Tool(api as never, publicOrigin as never);
      expect(tool.zodSchema).toBeInstanceOf(z.ZodType);
      await expect(
        tool.handler({ ...input, project_id: 'other', password: 'secret' } as never, context)
      ).rejects.toBeInstanceOf(z.ZodError);
      expect(api[method]).not.toHaveBeenCalled();
    }
  );

  it.each(cases)(
    '%s delegates with authenticated actor and schema-valid output',
    async (Tool, method, input) => {
      const api = facade();
      const tool = new Tool(api as never, publicOrigin as never);
      const result = await tool.handler(input as never, context);
      expect(api[method].mock.calls[0][0]).toEqual(actor);
      const output = z.object(tool.outputSchema).parse(result.structuredContent);
      if (['list', 'get', 'create', 'update'].includes(method)) {
        const expected = { url: 'https://app.example/ui/project/data-storages?id=storage' };
        expect(output).toMatchObject(method === 'list' ? { storages: [expected] } : expected);
      }
    }
  );

  it('rejects Legacy creation', async () => {
    const tool = new CreateStorageTool(facade() as never, publicOrigin as never);
    await expect(
      tool.handler(
        {
          storage_type: 'LEGACY_GOOGLE_BIGQUERY',
        } as never,
        context
      )
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it('rejects secret fields in configuration and empty mutations', async () => {
    const update = new UpdateStorageTool(facade() as never, publicOrigin as never);
    await expect(
      update.handler(
        {
          storage_id: 'storage',
          configuration: { projectId: 'my-project', password: 'secret' },
        } as never,
        context
      )
    ).rejects.toBeInstanceOf(z.ZodError);
    await expect(
      update.handler({ storage_id: 'storage' } as never, context)
    ).rejects.toBeInstanceOf(z.ZodError);
    const access = new SetStorageAccessTool(facade() as never);
    await expect(
      access.handler({ storage_id: 'storage' } as never, context)
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it('preserves omitted update fields and maps a Credential ID', async () => {
    const api = facade();
    await new UpdateStorageTool(api as never, publicOrigin as never).handler(
      { storage_id: 'storage', credential_id: 'credential' },
      context
    );
    expect(api.update).toHaveBeenCalledWith(actor, 'storage', { credentialId: 'credential' });
  });

  it('requires a namespace for resource listing', async () => {
    const tool = new ListStorageResourcesTool(facade() as never);
    await expect(
      tool.handler({ storage_id: 'storage', level: 'resources' } as never, context)
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  const setupErrors = [
    [
      UpdateStorageTool,
      'update',
      { storage_id: 'storage', credential_id: 'credential' },
      'Set the Storage configuration before selecting a Credential.',
    ],
    [
      ListStorageResourcesTool,
      'listResources',
      { storage_id: 'storage', level: 'namespaces' },
      'Configure this Storage before listing resources.',
    ],
  ] as const;

  it.each(setupErrors)(
    '%s returns setup guidance without extra error data',
    async (Tool, method, input, message) => {
      const api = facade();
      api[method].mockRejectedValue(
        new BadRequestException({ message, providerDetails: 'NEVER_EXPOSE' })
      );
      const result = new Tool(api as never, publicOrigin as never).handler(input as never, context);

      await expect(result).rejects.toMatchObject({ status: 400, message });
      await result.catch(error => expect(JSON.stringify(error)).not.toContain('NEVER_EXPOSE'));
    }
  );

  it.each(setupErrors)(
    '%s does not expose diagnostics appended to a known message',
    async (Tool, method, input, message) => {
      const api = facade();
      api[method].mockRejectedValue(new BadRequestException(`${message} token=NEVER_EXPOSE`));
      const result = new Tool(api as never, publicOrigin as never).handler(input as never, context);

      await expect(result).rejects.toMatchObject({ status: 400 });
      await result.catch(error => expect(JSON.stringify(error)).not.toContain('NEVER_EXPOSE'));
    }
  );

  it.each(cases.filter(([, method]) => ['list', 'get', 'create', 'validate'].includes(method)))(
    '%s removes private details from unexpected errors',
    async (Tool, method, input) => {
      const api = facade();
      api[method].mockRejectedValue(new Error('NEVER_EXPOSE'));
      const result = new Tool(api as never, publicOrigin as never).handler(input as never, context);

      await expect(result).rejects.toMatchObject({ status: 500 });
      await result.catch(error => expect(error.message).not.toContain('NEVER_EXPOSE'));
    }
  );

  it.each([
    [new ForbiddenException('NEVER_EXPOSE'), 403],
    [new NotFoundException('NEVER_EXPOSE'), 404],
    [new ConflictException('NEVER_EXPOSE'), 409],
    [new BadRequestException('NEVER_EXPOSE'), 400],
    [
      new AccessValidationException('Invalid configuration: NEVER_EXPOSE', {
        fieldErrors: [{ field: 'config.projectId', message: 'NEVER_EXPOSE' }],
      }),
      400,
    ],
    [new Error('NEVER_EXPOSE'), 500],
  ])('preserves the update error status and removes private details: %s', async (error, status) => {
    const api = facade();
    api.update.mockRejectedValue(error);
    const result = new UpdateStorageTool(api as never, publicOrigin as never).handler(
      { storage_id: 'storage', title: 'New' },
      context
    );
    await expect(result).rejects.toMatchObject({ status });
    await result.catch(error => expect(JSON.stringify(error)).not.toContain('NEVER_EXPOSE'));
  });

  it('removes private details from access errors and does not acknowledge the change', async () => {
    const api = facade();
    api.setAccess.mockRejectedValue(
      new BusinessViolationException('Invalid owners: NEVER_EXPOSE', { ownerIds: ['NEVER_EXPOSE'] })
    );
    const result = new SetStorageAccessTool(api as never).handler(
      { storage_id: 'storage', owner_ids: [] },
      context
    );
    await expect(result).rejects.toThrow('Check the owners and Contexts.');
    await result.catch(error => expect(JSON.stringify(error)).not.toContain('NEVER_EXPOSE'));
  });

  it.each([
    [new Error('NEVER_EXPOSE'), 502],
    [new BadRequestException('NEVER_EXPOSE'), 400],
    [new ForbiddenException('NEVER_EXPOSE'), 403],
    [new NotFoundException('NEVER_EXPOSE'), 404],
  ])('removes private details from resource browsing errors: %s', async (error, status) => {
    const api = facade();
    api.listResources.mockRejectedValue(error);
    const result = new ListStorageResourcesTool(api as never).handler(
      { storage_id: 'storage', level: 'namespaces' },
      context
    );
    await expect(result).rejects.toMatchObject({ status });
    await result.catch(error => expect(JSON.stringify(error)).not.toContain('NEVER_EXPOSE'));
  });

  it.each([
    "Legacy Google BigQuery storage can't be deleted manually.",
    'Cannot delete the storage because it is referenced by existing data marts.',
  ])('preserves the deletion blocker without private IDs: %s', async message => {
    const api = facade();
    api.delete.mockRejectedValue(
      new BusinessViolationException(message, { referencedDataMarts: ['private-mart'] })
    );
    const result = new DeleteStorageTool(api as never).handler({ storage_id: 'storage' }, context);
    await expect(result).rejects.toThrow(message);
    await result.catch(error => expect(JSON.stringify(error)).not.toContain('private-mart'));
  });
});
