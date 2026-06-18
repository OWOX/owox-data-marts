import { ArgumentsHost, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpConfigService } from '../config/mcp.config';
import { McpAuthExceptionFilter } from './mcp-auth.exception-filter';

describe('McpAuthExceptionFilter', () => {
  it('adds OAuth protected-resource challenge to 401 responses', () => {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const filter = new McpAuthExceptionFilter(
      new McpConfigService({
        get: jest.fn((key: string) =>
          key === 'MCP_PUBLIC_BASE_URL' ? 'https://mcp.owox.com' : undefined
        ),
      } as unknown as ConfigService)
    );

    filter.catch(new UnauthorizedException('Invalid MCP bearer token'), host);

    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://mcp.owox.com/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"'
    );
    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 401,
      message: 'Invalid MCP bearer token',
      error: 'Unauthorized',
    });
  });
});
