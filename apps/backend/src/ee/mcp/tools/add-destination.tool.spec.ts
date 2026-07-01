import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpDataDestinationsFacade } from '../../../data-marts/facades/mcp-data-destinations.facade';
import { AddDestinationTool } from './add-destination.tool';

describe('AddDestinationTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['editor'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:write'],
    authFlow: 'mcp',
  };

  let destinationsFacade: jest.Mocked<McpDataDestinationsFacade>;
  let tool: AddDestinationTool;

  beforeEach(() => {
    destinationsFacade = {
      listDestinations: jest.fn(),
      createDestination: jest.fn(),
      beginGoogleSheetsSetup: jest.fn().mockResolvedValue({
        setupUrl: 'https://app.owox.com/data-destinations/oauth/mcp/google-sheets/start?token=abc',
      }),
    };

    tool = new AddDestinationTool(destinationsFacade);
  });

  it('describes metadata properly', () => {
    expect(tool).toMatchObject({
      name: 'add_destination',
      requiredScopes: ['mcp:write'],
      annotations: {
        title: 'Add Destination',
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tool.description).toContain('google_sheets');
    expect(tool.description).toContain('email-based types');
    expect(tool.description).toContain('looker_studio');
  });

  it('validates and parses valid input', () => {
    const valid = {
      destination_type: 'google_sheets',
      redirect_back: 'https://claude.ai/chat/123',
    };
    expect(tool.parseInput(valid)).toEqual(valid);
  });

  it('rejects invalid destination types', () => {
    const invalid = {
      destination_type: 'invalid_type',
    };
    expect(() => tool.parseInput(invalid)).toThrow();
  });

  it('rejects invalid redirect_back URL format', () => {
    const invalid = {
      destination_type: 'google_sheets',
      redirect_back: 'not-a-url',
    };
    expect(() => tool.parseInput(invalid)).toThrow();
  });

  it('rejects creation for a caller without editor/admin role', async () => {
    const result = await tool.handler(
      { destination_type: 'google_sheets' },
      { ...context, roles: ['viewer'] }
    );

    const structured = result.structuredContent as any;
    expect(structured.error).toBe('PERMISSION_DENIED');
    expect(structured.instructions).toContain('Editor or Admin role');
    expect(destinationsFacade.beginGoogleSheetsSetup).not.toHaveBeenCalled();
    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
  });

  it('allows creation for a caller with the admin role', async () => {
    const result = await tool.handler(
      { destination_type: 'google_sheets' },
      { ...context, roles: ['admin'] }
    );

    const structured = result.structuredContent as any;
    expect(structured.error).toBeUndefined();
    expect(destinationsFacade.beginGoogleSheetsSetup).toHaveBeenCalled();
  });

  it('requests a Google Sheets setup link with defaults', async () => {
    const result = await tool.handler({ destination_type: 'google_sheets' }, context);

    expect(destinationsFacade.beginGoogleSheetsSetup).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      title: undefined,
      redirectBack: undefined,
    });

    const structured = result.structuredContent as any;
    expect(structured.authorization_url).toBe(
      'https://app.owox.com/data-destinations/oauth/mcp/google-sheets/start?token=abc'
    );
    expect(structured.instructions).toContain('straight to Google');

    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify(structured, null, 2),
    });
  });

  it('passes through title and redirect_back to the Google Sheets setup request', async () => {
    await tool.handler(
      {
        destination_type: 'google_sheets',
        title: 'My Google Sheets',
        redirect_back: 'https://claude.ai/chat/123',
      },
      context
    );

    expect(destinationsFacade.beginGoogleSheetsSetup).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      title: 'My Google Sheets',
      redirectBack: 'https://claude.ai/chat/123',
    });
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
      roles: ['editor'],
      type: 'email',
      title: 'Marketing Email List',
      emails: ['test@example.com', 'user@example.com'],
    });

    const structured = result.structuredContent as any;
    expect(structured.destination_id).toBe('new-dest-id');
    expect(structured.instructions).toContain('Successfully connected Email destination');
  });

  it('supports direct creation of looker_studio destination and returns credentials', async () => {
    destinationsFacade.createDestination.mockResolvedValue({
      id: 'looker-dest-id',
      name: 'Looker Studio MCP Destination',
      lookerStudioCredentials: {
        destinationId: 'looker-dest-id',
        destinationSecretKey: 'mock-secret-key-123',
        deploymentUrl: 'https://looker.example.com',
      },
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
      roles: ['editor'],
      type: 'looker_studio',
      title: 'Looker Studio MCP Destination',
    });

    const structured = result.structuredContent as any;
    expect(structured.destination_id).toBe('looker-dest-id');
    expect(structured.instructions).toContain(
      'Looker Studio Destination has been successfully enabled'
    );
    expect(structured.instructions).toContain(
      'Destination Secret Key (Token): mock-secret-key-123'
    );
  });

  it('returns a structured error if emails are missing for email-based types', async () => {
    const result = await tool.handler(
      {
        destination_type: 'email',
        title: 'Marketing Email List',
      },
      context
    );

    const structured = result.structuredContent as any;
    expect(structured.error).toBe('MISSING_EMAILS');
    expect(structured.instructions).toContain(
      "The 'emails' parameter is required for creating a Email destination"
    );
    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
  });
});
