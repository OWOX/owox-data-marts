import type { McpAuthContext } from '../../auth/mcp-auth-context';
import type { McpDataDestinationsFacade } from '../../../../data-marts/facades/mcp-data-destinations.facade';
import type { PublicOriginService } from '../../../../common/config/public-origin.service';
import type {
  CredentialSetupDto,
  McpCredentialsFacade,
} from '../../../../data-marts/credentials/facades/mcp-credentials.facade';
import { AddDestinationTool } from './add-destination.tool';

describe('AddDestinationTool', () => {
  const setup: CredentialSetupDto = {
    id: 'setup-1',
    mode: 'create',
    status: 'pending',
    definitionId: 'google-sheets-oauth',
    credentialId: null,
    title: null,
    createdAt: new Date('2026-11-02T12:00:00Z'),
    expiresAt: new Date('2026-11-02T12:30:00Z'),
    completedAt: null,
  };
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:write'],
    authFlow: 'mcp',
  };

  let destinationsFacade: jest.Mocked<
    Pick<McpDataDestinationsFacade, 'listDestinations' | 'createDestination'>
  >;
  let publicOriginService: jest.Mocked<PublicOriginService>;
  let credentialsFacade: jest.Mocked<Pick<McpCredentialsFacade, 'startSetup'>>;
  let tool: AddDestinationTool;

  beforeEach(() => {
    destinationsFacade = {
      listDestinations: jest.fn(),
      createDestination: jest.fn(),
    };
    publicOriginService = {
      getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
    } as unknown as jest.Mocked<PublicOriginService>;
    credentialsFacade = {
      startSetup: jest.fn().mockResolvedValue(setup),
    };

    tool = new AddDestinationTool(
      destinationsFacade as unknown as McpDataDestinationsFacade,
      publicOriginService,
      credentialsFacade as never
    );
  });

  it('describes metadata properly', () => {
    expect(tool).toMatchObject({
      name: 'add_destination',
      requiredScopes: ['mcp:write'],
      annotations: {
        title: 'Add Destination',
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    });
    expect(tool.description).toContain('google_sheets');
    expect(tool.description).toContain('credential_id');
    expect(tool.description).toContain('webhook');
    expect(tool.description).toContain('looker_studio');
  });

  it('validates and parses valid input', () => {
    const valid = {
      destination_type: 'google_sheets',
      title: 'My Google Sheets',
    };
    expect(tool.parseInput(valid)).toEqual(valid);
  });

  it('passes a Drive folder to direct creation', async () => {
    destinationsFacade.createDestination.mockResolvedValue({ id: 'destination', name: 'Sheets' });
    const folderUrl = 'https://drive.google.com/drive/folders/folder';
    await tool.handler(
      {
        destination_type: 'google_sheets',
        credential_id: 'credential',
        drive_folder_url: folderUrl,
      },
      context
    );
    expect(destinationsFacade.createDestination).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'credential',
        folderUrl,
      })
    );
  });

  it('keeps the folder URL in the browser setup follow-up instructions', async () => {
    const folderUrl = 'https://drive.google.com/drive/folders/folder';
    const result = await tool.handler(
      { destination_type: 'google_sheets', drive_folder_url: folderUrl },
      context
    );
    expect((result.structuredContent as Record<string, unknown>).instructions).toContain(folderUrl);
    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
  });

  it('rejects folder configuration for other destination types', () => {
    expect(() =>
      tool.parseInput({
        destination_type: 'looker_studio',
        drive_folder_url: 'https://drive.google.com/drive/folders/folder',
      })
    ).toThrow();
  });

  it.each(['', '   '])('rejects blank destination titles', title => {
    expect(() => tool.parseInput({ destination_type: 'email', title })).toThrow();
  });

  it('rejects invalid destination types', () => {
    const invalid = {
      destination_type: 'invalid_type',
    };
    expect(() => tool.parseInput(invalid)).toThrow();
  });

  it('does not offer excel, and refuses it at the schema rather than in the handler', () => {
    // The Excel destination is resolved by the add-in on first use, so this tool has no
    // creation flow for it. Refusing it here — instead of letting it fall through to the
    // "no creation flow is implemented" backstop — keeps the option out of what an agent
    // is shown in the first place.
    expect(tool.zodSchema.shape.destination_type.options).not.toContain('excel');
    expect(() => tool.parseInput({ destination_type: 'excel' })).toThrow();
  });

  it('allows a viewer to start Google Sheets Credential setup', async () => {
    const result = await tool.handler({ destination_type: 'google_sheets' }, context);

    const structured = result.structuredContent as any;
    expect(structured.authorization_url).toContain('/ui/project-1/connect/credentials/setup-1');
    expect(credentialsFacade.startSetup).toHaveBeenCalledWith(
      { projectId: context.projectId, userId: context.userId, roles: ['viewer'] },
      { definitionId: 'google-sheets-oauth' }
    );
    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
  });

  it('returns the exact Credential setup request without creating a destination', async () => {
    const result = await tool.handler({ destination_type: 'google_sheets' }, context);

    const structured = result.structuredContent as any;
    expect(structured.authorization_url).toBe(
      'https://app.owox.com/ui/project-1/connect/credentials/setup-1'
    );
    expect(structured.setup_id).toBe('setup-1');
    expect(structured.instructions).toContain('Sign in to OWOX');
    expect(structured.instructions).toContain('member of');
    expect(structured.instructions).toContain('same account');
    expect(structured.destination_id).toBeUndefined();
    expect(structured.instructions).toContain('does not create a destination');
    expect(structured.instructions).toContain('get_credential_setup_status');
    expect(structured.instructions).toContain('exact credential_id');
    expect(structured.instructions).toContain('call add_destination again');
    expect(structured.instructions).not.toContain('list_destinations');
    expect(structured.instructions).not.toContain('createdAt');
    expect(structured.instructions).not.toContain('connectedGoogleAccount');
    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
    expect(destinationsFacade.listDestinations).not.toHaveBeenCalled();

    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify(structured, null, 2),
    });
  });

  it('keeps the requested destination title separate from the browser Credential title', async () => {
    const result = await tool.handler(
      { destination_type: 'google_sheets', title: 'My Google Sheets' },
      context
    );

    const structured = result.structuredContent as any;
    const url = new URL(structured.authorization_url);
    expect(url.pathname).toBe('/ui/project-1/connect/credentials/setup-1');
    expect(url.search).toBe('');
    expect(structured.instructions).toContain('title "My Google Sheets"');
    expect(structured.instructions).toContain('The form title names the Credential');
    expect(credentialsFacade.startSetup).toHaveBeenCalledWith(expect.anything(), {
      definitionId: 'google-sheets-oauth',
    });
  });

  it('creates the destination only when the follow-up supplies the exact Credential ID', async () => {
    await tool.handler({ destination_type: 'google_sheets', title: 'Marketing export' }, context);
    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
    destinationsFacade.createDestination.mockResolvedValue({
      id: 'destination',
      name: 'Marketing export',
    });

    const result = await tool.handler(
      {
        destination_type: 'google_sheets',
        credential_id: 'credential-from-status',
        title: 'Marketing export',
      },
      context
    );

    expect(credentialsFacade.startSetup).toHaveBeenCalledTimes(1);
    expect(destinationsFacade.createDestination).toHaveBeenCalledTimes(1);
    expect(destinationsFacade.createDestination).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'credential-from-status',
        title: 'Marketing export',
      })
    );
    expect(result.structuredContent).toMatchObject({ destination_id: 'destination' });
    expect(result.structuredContent).not.toHaveProperty('setup_id');
  });

  it('encodes the project and setup ID in the shared Credential setup route', async () => {
    credentialsFacade.startSetup.mockResolvedValueOnce({
      ...setup,
      id: 'setup /#é',
    });
    const result = await tool.handler(
      { destination_type: 'google_sheets' },
      { ...context, projectId: 'project /?é' }
    );
    expect(result.structuredContent).toMatchObject({
      setup_id: 'setup /#é',
      authorization_url:
        'https://app.owox.com/ui/project%20%2F%3F%C3%A9/connect/credentials/setup%20%2F%23%C3%A9',
    });
  });

  it('does not expose setup errors or create a destination if Credential setup fails', async () => {
    credentialsFacade.startSetup.mockRejectedValueOnce(new Error('NEVER_EXPOSE'));
    const result = tool.handler({ destination_type: 'google_sheets' }, context);
    await expect(result).rejects.toMatchObject({ status: 500 });
    await result.catch(error => expect(error.message).not.toContain('NEVER_EXPOSE'));
    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
  });

  it('supports direct creation of email-based destination if emails are provided', async () => {
    destinationsFacade.createDestination.mockResolvedValue({
      id: 'new-dest-id',
      name: 'Marketing Email List',
    });

    const result = await tool.handler(
      {
        destination_type: 'email',
        title: 'Marketing Email List',
        emails: ['test@example.com', 'user@example.com'],
      },
      context
    );

    expect(destinationsFacade.createDestination).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      type: 'email',
      title: 'Marketing Email List',
      emails: ['test@example.com', 'user@example.com'],
    });

    const structured = result.structuredContent as any;
    expect(structured.destination_id).toBe('new-dest-id');
    expect(structured.instructions).toContain('Created Email Destination');
  });

  it.each(['google_sheets', 'google_chat'] as const)(
    'creates %s from a saved Credential without a browser handoff or secret fields',
    async destinationType => {
      destinationsFacade.createDestination.mockResolvedValue({ id: 'new-dest', name: 'My target' });

      const result = await tool.handler(
        { destination_type: destinationType, title: 'My target', credential_id: 'credential-1' },
        context
      );

      expect(destinationsFacade.createDestination).toHaveBeenCalledWith({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        type: destinationType,
        title: 'My target',
        credentialId: 'credential-1',
      });
      expect(result.structuredContent).toEqual({
        destination_id: 'new-dest',
        destination_url: 'https://app.owox.com/ui/project-1/data-destinations?id=new-dest',
        instructions: expect.stringContaining('Created'),
      });
      expect(credentialsFacade.startSetup).not.toHaveBeenCalled();
    }
  );

  it.each([
    { destination_type: 'google_chat', credential_id: 'credential-1', emails: [] },
    { destination_type: 'google_sheets', credential_id: 'credential-1', emails: ['a@b.test'] },
    { destination_type: 'email', credential_id: 'credential-1', emails: ['a@b.test'] },
    { destination_type: 'looker_studio', credential_id: 'credential-1' },
    { destination_type: 'google_sheets', credential_id: '' },
    { destination_type: 'google_sheets', credential_id: 'credential-1', secret: 'private-token' },
  ])('rejects invalid Credential input before creating anything: %j', async input => {
    await expect(tool.handler(input as never, context)).rejects.toThrow();
    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
    expect(credentialsFacade.startSetup).not.toHaveBeenCalled();
  });

  it('exposes the complete strict schema to the SDK', () => {
    expect(() =>
      tool.zodSchema.parse({ destination_type: 'google_sheets', secret: 'private-token' })
    ).toThrow();
  });

  it('supports direct creation of looker_studio destination without returning credentials', async () => {
    destinationsFacade.createDestination.mockResolvedValue({
      id: 'looker-dest-id',
      name: 'Looker Studio MCP Destination',
    });

    const result = await tool.handler(
      {
        destination_type: 'looker_studio',
        title: 'Looker Studio MCP Destination',
      },
      context
    );

    expect(destinationsFacade.createDestination).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      type: 'looker_studio',
      title: 'Looker Studio MCP Destination',
    });

    const structured = result.structuredContent as any;
    expect(structured.destination_id).toBe('looker-dest-id');
    expect(structured.instructions).toContain(
      'Created Looker Studio Destination "Looker Studio MCP Destination"'
    );
    expect(structured.instructions).toContain('open destination_url in OWOX');
    expect(JSON.stringify(structured)).not.toContain('destinationSecretKey');
    expect(JSON.stringify(structured)).not.toContain('lookerStudioCredentials');
  });

  it.each([
    ['email', 'Email'],
    ['slack', 'Slack'],
    ['teams', 'Teams'],
    ['google_chat', 'Google Chat'],
  ] as const)(
    'defaults the title to a plain label for %s, not an uppercase/MCP-suffixed one',
    async (type, expectedTitle) => {
      destinationsFacade.createDestination.mockResolvedValue({
        id: 'new-dest-id',
        name: expectedTitle,
      });

      await tool.handler({ destination_type: type, emails: ['user@example.com'] }, context);

      expect(destinationsFacade.createDestination).toHaveBeenCalledWith(
        expect.objectContaining({ title: expectedTitle })
      );
    }
  );

  it('throws a validation error if emails are missing for email-based types', async () => {
    await expect(
      tool.handler(
        {
          destination_type: 'email',
          title: 'Marketing Email List',
        },
        context
      )
    ).rejects.toThrow('Supply at least one email address');

    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
  });
});
