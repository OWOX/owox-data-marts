import { ArgumentsHost, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpResourceResolverService } from '../../../mcp-resource/mcp-resource-resolver.service';
import { McpConfigService } from '../config/mcp.config';
import { McpAuthExceptionFilter } from './mcp-auth.exception-filter';

describe('McpAuthExceptionFilter', () => {
  const createFilter = () => {
    const configService = new ConfigService({
      MCP_PUBLIC_BASE_URL: 'https://mcp.owox.com',
    });

    return new McpAuthExceptionFilter(
      new McpConfigService(configService),
      new McpResourceResolverService(configService)
    );
  };

  const createResponse = () => ({
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

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
    const filter = createFilter();

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

  it('uses project host in OAuth protected-resource challenge', () => {
    const response = createResponse();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/mcp',
          protocol: 'https',
          host: '8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com',
          headers: { host: '8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com' },
        }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const filter = createFilter();

    filter.catch(new UnauthorizedException('Missing MCP bearer token'), host);

    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://8c90f0b0f314bf5f5d6f69d24fd7ee3b.mcp.owox.com/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"'
    );
  });

  it('falls back to shared OAuth protected-resource challenge for invalid project hosts', () => {
    const response = createResponse();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/mcp',
          protocol: 'https',
          headers: {
            host: 'not-md5.mcp.owox.com',
          },
        }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const filter = createFilter();

    filter.catch(new UnauthorizedException('Missing MCP bearer token'), host);

    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://mcp.owox.com/.well-known/oauth-protected-resource", scope="mcp:read mcp:write"'
    );
    expect(response.status).toHaveBeenCalledWith(401);
  });
});
