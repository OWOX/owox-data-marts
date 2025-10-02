import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import { IntercomController } from './intercom.controller';
import type { AuthorizationContext } from '../types';

jest.mock('jsonwebtoken', () => ({
  __esModule: true,
  default: {
    sign: jest.fn(),
  },
}));

jest.mock('../decorators/auth.decorator', () => ({
  __esModule: true,
  Auth: () => () => {
    /* no-op decorator */
  },
}));

jest.mock('../decorators/auth-context.decorator', () => ({
  __esModule: true,
  AuthContext: () => () => {
    /* no-op param decorator */
  },
}));

describe('IntercomController', () => {
  let controller: IntercomController;
  let configService: jest.Mocked<ConfigService>;

  const makeCtx = (overrides: Partial<AuthorizationContext> = {}): AuthorizationContext => ({
    userId: 'user-123',
    email: 'user@example.com',
    fullName: 'John Doe',
    projectId: 'project-456',
    projectTitle: 'My Project',
    ...overrides,
  });

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    controller = new IntercomController(configService);

    jest.clearAllMocks();
  });

  it('should throw BadRequestException if INTERCOM_SECRET_KEY is missing or blank', async () => {
    configService.get.mockReturnValue('   ');

    const ctx = makeCtx();

    await expect(controller.issueJwt(ctx)).rejects.toEqual(
      new BadRequestException('INTERCOM_SECRET_KEY is not configured')
    );
  });

  it('should sign and return jwt when INTERCOM_SECRET_KEY is provided', async () => {
    configService.get.mockReturnValue('super-secret');

    const ctx = makeCtx();

    const mockedSign = (jwt as unknown as { sign: jest.Mock }).sign as jest.Mock;
    mockedSign.mockReturnValue('signed-token');

    const result = await controller.issueJwt(ctx);

    expect(result).toEqual({ token: 'signed-token' });

    expect(mockedSign).toHaveBeenCalledTimes(1);
    const expectedPayload = {
      user_id: ctx.userId,
      email: ctx.email,
    } as Record<string, unknown>;

    expect(mockedSign).toHaveBeenCalledWith(expectedPayload, 'super-secret', {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
  });
});
