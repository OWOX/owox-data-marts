import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpDataDestinationsFacade } from '../../../data-marts/facades/mcp-data-destinations.facade';
import type { PublicOriginService } from '../../../common/config/public-origin.service';
import { AddDestinationTool } from './add-destination.tool';

describe('AddDestinationTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:write'],
    authFlow: 'mcp',
  };

  let destinationsFacade: jest.Mocked<McpDataDestinationsFacade>;
  let publicOriginService: jest.Mocked<PublicOriginService>;
  let tool: AddDestinationTool;

  beforeEach(() => {
    destinationsFacade = {
      listDestinations: jest.fn(),
      createDestination: jest.fn(),
    };
    publicOriginService = {
      getPublicOrigin: jest.fn(() => 'https://app.owox.com'),
    } as unknown as jest.Mocked<PublicOriginService>;

    tool = new AddDestinationTool(destinationsFacade, publicOriginService);
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
      title: 'My Google Sheets',
    };
    expect(tool.parseInput(valid)).toEqual(valid);
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

  // No role gate here: creating a destination has no parent entity to check access
  // against (unlike reports/schedules, which check access on the data mart/report they
  // attach to), and the REST API allows any project member (viewer included) to create
  // one via POST /data-destinations — this tool matches that, not a stricter policy.
  it('allows creation for a caller with only the viewer role', async () => {
    const result = await tool.handler({ destination_type: 'google_sheets' }, context);

    const structured = result.structuredContent as any;
    expect(structured.authorization_url).toContain('/ui/project-1/connect/google-sheets');
  });

  it('builds a Connect Google Sheets page link with defaults', async () => {
    const result = await tool.handler({ destination_type: 'google_sheets' }, context);

    const structured = result.structuredContent as any;
    expect(structured.authorization_url).toBe(
      'https://app.owox.com/ui/project-1/connect/google-sheets'
    );
    expect(structured.instructions).toContain('signed in to OWOX');
    expect(structured.instructions).toContain('member of');
    expect(structured.instructions).toContain('same account');
    // No destination_id is returned for google_sheets — the entity doesn't exist yet —
    // and the agent must be told explicitly how to find it afterward.
    expect(structured.destination_id).toBeUndefined();
    expect(structured.instructions).toContain('does NOT include a destination_id');
    expect(structured.instructions).toContain('list_destinations');
    expect(structured.instructions).toContain('never pick by createdAt');
    expect(structured.instructions).toContain('cannot be predicted in advance');
    expect(structured.instructions).toContain('connectedGoogleAccount');
    expect(structured.instructions).toContain('ask the user which one they mean');

    expect(result.content[0]).toEqual({
      type: 'text',
      text: JSON.stringify(structured, null, 2),
    });
  });

  // The Connect Google Sheets page never pre-fills its Title field from a link — an
  // unverified query param isn't proof of what the user wants — so `title` is ignored
  // entirely for google_sheets, unlike the directly-created types below.
  it('ignores the title parameter for google_sheets — no query param on the link at all', async () => {
    const result = await tool.handler(
      { destination_type: 'google_sheets', title: 'My Google Sheets' },
      context
    );

    const structured = result.structuredContent as any;
    const url = new URL(structured.authorization_url);
    expect(url.pathname).toBe('/ui/project-1/connect/google-sheets');
    expect(url.search).toBe('');
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
    expect(structured.instructions).toContain('Successfully connected Email destination');
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
      'Data Studio Destination "Looker Studio MCP Destination" has been successfully enabled'
    );
    expect(structured.instructions).toContain('Data Destinations in OWOX Data Marts');
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
    ).rejects.toThrow(
      "The 'emails' parameter is required for creating email-based destination types"
    );

    expect(destinationsFacade.createDestination).not.toHaveBeenCalled();
  });
});
