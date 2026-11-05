import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { GetDestinationTool } from './get-destination.tool';
import { UpdateDestinationTool } from './update-destination.tool';
import { SetDestinationAccessTool } from './set-destination-access.tool';
import { GetDestinationImpactTool } from './get-destination-impact.tool';
import { DeleteDestinationTool } from './delete-destination.tool';
import { RotateDestinationSecretKeyTool } from './rotate-destination-secret-key.tool';
import { AccessValidationException } from '../../../../common/exceptions/access-validation.exception';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { z } from 'zod';

const context: McpAuthContext = {
  projectId: 'project',
  userId: 'member',
  roles: ['viewer'],
  clientId: 'client',
  resource: 'https://mcp.example/mcp',
  scopes: ['mcp:read', 'mcp:write'],
  authFlow: 'mcp',
};
const actor = { projectId: 'project', userId: 'member', roles: ['viewer'] };
const origin = { getPublicOrigin: () => 'https://app.example' };
const source = {
  id: 'destination',
  name: 'Destination',
  type: 'looker_studio',
  owner: 'creator@example.com',
  connectedGoogleAccount: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  owners: [{ userId: 'owner', name: 'Owner', email: 'owner@example.com' }],
  contexts: [{ id: 'context', name: 'Finance', icon: null }],
  availableForUse: false,
  availableForMaintenance: false,
  credential: null,
  emails: null,
  folderUrl: null,
  credentials: { destinationSecretKey: 'NEVER_EXPOSE' },
  credentialId: 'private-row',
};

describe('Destination MCP tools', () => {
  it('gets safe details and uses only the authenticated actor', async () => {
    const facade = { getDestination: jest.fn().mockResolvedValue(source) };
    const tool = new GetDestinationTool(facade as never, origin as never);
    const result = await tool.handler({ destination_id: 'destination' }, context);
    expect(facade.getDestination).toHaveBeenCalledWith(actor, 'destination');
    expect(result.structuredContent).toMatchObject({
      destination_id: 'destination',
      type: 'looker_studio',
      url: 'https://app.example/ui/project/data-destinations?id=destination',
      connected_google_account: null,
      created_at: source.createdAt,
      owners: [{ user_id: 'owner', name: 'Owner', email: 'owner@example.com' }],
      contexts: [{ context_id: 'context', name: 'Finance', icon: null }],
      drive_folder_url: null,
    });
    for (const field of ['id', 'connectedGoogleAccount', 'createdAt']) {
      expect(result.structuredContent).not.toHaveProperty(field);
      expect(tool.outputSchema).not.toHaveProperty(field);
    }
    expect(z.object(tool.outputSchema).strict().parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
    expect(JSON.stringify(result)).not.toMatch(/NEVER_EXPOSE|private-row|destinationSecretKey/);
  });

  it('maps supplied update fields without supplying defaults for omitted fields', async () => {
    const facade = { updateDestination: jest.fn().mockResolvedValue(source) };
    const tool = new UpdateDestinationTool(facade as never, origin as never);
    const result = await tool.handler(
      { destination_id: 'destination', drive_folder_url: null },
      context
    );
    expect(facade.updateDestination).toHaveBeenCalledWith(actor, {
      destinationId: 'destination',
      folderUrl: null,
    });
    expect(result.structuredContent).toMatchObject({
      destination_id: 'destination',
      connected_google_account: null,
      created_at: source.createdAt,
      drive_folder_url: null,
    });
    for (const field of ['id', 'connectedGoogleAccount', 'createdAt']) {
      expect(result.structuredContent).not.toHaveProperty(field);
      expect(tool.outputSchema).not.toHaveProperty(field);
    }
    expect(z.object(tool.outputSchema).strict().parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
    expect(() => tool.parseInput({ destination_id: 'destination' })).toThrow();
    expect(() =>
      tool.parseInput({
        destination_id: 'destination',
        emails: ['a@example.com'],
        credential_id: 'credential',
      })
    ).toThrow();
    expect(() => tool.parseInput({ destination_id: 'destination', emails: [] })).toThrow();
    expect(() => tool.parseInput({ destination_id: 'destination', title: null })).toThrow();
  });

  it.each([
    'https://drive.google.com/drive/my-drive',
    'https://example.com/drive/folders/folder',
    'http://drive.google.com/drive/folders/folder',
    'not-a-url',
  ])('rejects a non-folder URL before calling the facade: %s', async folderUrl => {
    const facade = { updateDestination: jest.fn() };
    const tool = new UpdateDestinationTool(facade as never, origin as never);
    await expect(
      tool.handler({ destination_id: 'destination', drive_folder_url: folderUrl }, context)
    ).rejects.toThrow();
    expect(facade.updateDestination).not.toHaveBeenCalled();
  });

  it('preserves an explicit empty access list', async () => {
    const facade = {
      setDestinationAccess: jest.fn().mockResolvedValue({ id: 'destination', status: 'updated' }),
    };
    const tool = new SetDestinationAccessTool(facade as never, origin as never);
    const result = await tool.handler(
      { destination_id: 'destination', owner_ids: [], available_for_use: false },
      context
    );
    expect(facade.setDestinationAccess).toHaveBeenCalledWith(actor, {
      destinationId: 'destination',
      ownerIds: [],
      availableForUse: false,
    });
    expect(result.structuredContent).toMatchObject({
      destination_id: 'destination',
      status: 'updated',
    });
    expect(() => tool.parseInput({ destination_id: 'destination' })).toThrow();
    expect(() => tool.parseInput({ destination_id: 'destination', context_ids: null })).toThrow();
  });

  it.each(['owner_ids', 'context_ids'] as const)(
    'rejects oversized %s before changing access',
    async field => {
      const facade = { setDestinationAccess: jest.fn() };
      const tool = new SetDestinationAccessTool(facade as never, origin as never);

      await expect(
        tool.handler(
          {
            destination_id: 'destination',
            [field]: Array.from({ length: 1001 }, (_, i) => `${i}`),
          },
          context
        )
      ).rejects.toThrow();
      expect(facade.setDestinationAccess).not.toHaveBeenCalled();
    }
  );

  it('returns impact counts without related report data', async () => {
    const facade = {
      getDestinationImpact: jest.fn().mockResolvedValue({
        destinationId: 'destination',
        destinationTitle: 'Destination',
        reportsCount: 4,
        dataMartCount: 2,
        secret: 'NEVER_EXPOSE',
      }),
    };
    const result = await new GetDestinationImpactTool(facade as never).handler(
      { destination_id: 'destination' },
      context
    );
    expect(result.structuredContent).toEqual({
      destination_id: 'destination',
      reports_count: 4,
      data_mart_count: 2,
    });
  });

  it('acknowledges deletion without returning its Credential', async () => {
    const facade = {
      deleteDestination: jest
        .fn()
        .mockResolvedValue({ id: 'destination', status: 'deleted', secret: 'NEVER_EXPOSE' }),
    };
    const result = await new DeleteDestinationTool(facade as never, origin as never).handler(
      { destination_id: 'destination' },
      context
    );
    expect(result.structuredContent).toMatchObject({
      destination_id: 'destination',
      status: 'deleted',
    });
    expect(JSON.stringify(result)).not.toContain('NEVER_EXPOSE');
  });

  it('rotates by Destination ID and returns only status and a UI link', async () => {
    const facade = {
      rotateDestinationSecretKey: jest.fn().mockResolvedValue({
        id: 'destination',
        status: 'rotated',
        destinationSecretKey: 'NEVER_EXPOSE',
      }),
    };
    const tool = new RotateDestinationSecretKeyTool(facade as never, origin as never);
    const result = await tool.handler({ destination_id: 'destination' }, context);
    expect(facade.rotateDestinationSecretKey).toHaveBeenCalledWith(actor, 'destination');
    expect(result.structuredContent).toEqual({
      destination_id: 'destination',
      status: 'rotated',
      destination_url: 'https://app.example/ui/project/data-destinations?id=destination',
    });
    expect(JSON.stringify(result)).not.toContain('NEVER_EXPOSE');
  });

  const tools = [
    GetDestinationTool,
    UpdateDestinationTool,
    SetDestinationAccessTool,
    GetDestinationImpactTool,
    DeleteDestinationTool,
    RotateDestinationSecretKeyTool,
  ];
  it.each(tools)('%p registers a full strict schema', Tool => {
    const tool = new Tool({} as never, origin as never);
    expect('parse' in tool.zodSchema).toBe(true);
    expect(() =>
      tool.parseInput({
        destination_id: 'destination',
        title: 'Title',
        token: 'NEVER_EXPOSE',
        project_id: 'other',
      } as never)
    ).toThrow();
    expect(tool.requiredRole).toBe('viewer');
  });

  it('does not expose provider diagnostics in mutation errors', async () => {
    const facade = {
      updateDestination: jest.fn().mockRejectedValue(new Error('provider token=NEVER_EXPOSE')),
    };
    const tool = new UpdateDestinationTool(facade as never, origin as never);
    await expect(
      tool.handler({ destination_id: 'destination', title: 'Title' }, context)
    ).rejects.not.toThrow('NEVER_EXPOSE');
  });

  const unsupportedOperations = [
    [
      UpdateDestinationTool,
      'updateDestination',
      {
        destination_id: 'destination',
        drive_folder_url: 'https://drive.google.com/drive/folders/folder',
      },
      'Only Google Sheets destinations support a Drive folder.',
    ],
    [
      RotateDestinationSecretKeyTool,
      'rotateDestinationSecretKey',
      { destination_id: 'destination' },
      'Only Looker Studio destinations support key rotation.',
    ],
  ] as const;

  it.each(unsupportedOperations)(
    '%s explains unsupported operations without extra error data',
    async (Tool, method, input, message) => {
      const facade = {
        [method]: jest
          .fn()
          .mockRejectedValue(new BadRequestException({ message, providerDetails: 'NEVER_EXPOSE' })),
      };
      const result = new Tool(facade as never, origin as never).handler(input as never, context);

      await expect(result).rejects.toMatchObject({ status: 400, message });
      await result.catch(error => expect(JSON.stringify(error)).not.toContain('NEVER_EXPOSE'));
    }
  );

  it.each(unsupportedOperations)(
    '%s does not expose diagnostics appended to a known message',
    async (Tool, method, input, message) => {
      const facade = {
        [method]: jest.fn().mockRejectedValue(new BadRequestException(`${message} NEVER_EXPOSE`)),
      };
      const result = new Tool(facade as never, origin as never).handler(input as never, context);

      await expect(result).rejects.toMatchObject({ status: 400 });
      await result.catch(error => expect(JSON.stringify(error)).not.toContain('NEVER_EXPOSE'));
    }
  );

  it('preserves a provider validation failure as a bad request without its diagnostic text', async () => {
    const facade = {
      updateDestination: jest.fn().mockRejectedValue(new HttpException('token=NEVER_EXPOSE', 400)),
    };
    const tool = new UpdateDestinationTool(facade as never, origin as never);
    await expect(
      tool.handler({ destination_id: 'destination', title: 'Title' }, context)
    ).rejects.toThrow(BadRequestException);
    await expect(
      tool.handler({ destination_id: 'destination', title: 'Title' }, context)
    ).rejects.not.toThrow('NEVER_EXPOSE');
  });

  it('reports recipient validation as an update failure without deletion advice or provider details', async () => {
    const facade = {
      updateDestination: jest
        .fn()
        .mockRejectedValue(new AccessValidationException('token=NEVER_EXPOSE')),
    };
    const tool = new UpdateDestinationTool(facade as never, origin as never);
    const error = await tool
      .handler({ destination_id: 'destination', emails: ['invalid@example.test'] }, context)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain('Check the supplied fields');
    expect((error as Error).message).not.toMatch(/delete|Reports|NEVER_EXPOSE/);
  });

  it('explains the dependency restriction only for destination deletion', async () => {
    const facade = {
      deleteDestination: jest
        .fn()
        .mockRejectedValue(new BusinessViolationException('raw=NEVER_EXPOSE')),
    };
    const tool = new DeleteDestinationTool(facade as never, origin as never);
    await expect(tool.handler({ destination_id: 'destination' }, context)).rejects.toThrow(
      'Cannot delete this Destination while Reports reference it.'
    );
  });

  it('keeps permission failures forbidden without returning raw error details', async () => {
    const facade = {
      getDestination: jest.fn().mockRejectedValue(new ForbiddenException('NEVER_EXPOSE')),
    };
    const tool = new GetDestinationTool(facade as never, origin as never);
    await expect(tool.handler({ destination_id: 'destination' }, context)).rejects.toThrow(
      ForbiddenException
    );
    await expect(tool.handler({ destination_id: 'destination' }, context)).rejects.not.toThrow(
      'NEVER_EXPOSE'
    );
  });
});
