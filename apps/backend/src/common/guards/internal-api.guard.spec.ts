import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { InternalApiGuard } from './internal-api.guard';

// Mock OAuth2Client
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

describe('InternalApiGuard', () => {
  let guard: InternalApiGuard;
  let configService: jest.Mocked<ConfigService>;

  const mockExecutionContext = (authHeader?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: authHeader,
          },
        }),
      }),
    }) as unknown as ExecutionContext;

  describe('when not configured', () => {
    beforeEach(async () => {
      configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [InternalApiGuard, { provide: ConfigService, useValue: configService }],
      }).compile();

      guard = module.get<InternalApiGuard>(InternalApiGuard);
    });

    it('should throw UnauthorizedException when guard is not configured', async () => {
      const context = mockExecutionContext('Bearer some-token');

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('when configured', () => {
    const expectedAudience = 'test-audience';
    const expectedSigningAccount = 'test@example.com';
    let mockVerifyIdToken: jest.Mock;

    beforeEach(async () => {
      configService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'INTERNAL_API_AUDIENCE') return expectedAudience;
          if (key === 'INTERNAL_API_AUTH_SERVICE_ACCOUNT') return expectedSigningAccount;
          return undefined;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [InternalApiGuard, { provide: ConfigService, useValue: configService }],
      }).compile();

      guard = module.get<InternalApiGuard>(InternalApiGuard);

      // Access the mocked OAuth2Client instance
      mockVerifyIdToken = (guard as unknown as { client: { verifyIdToken: jest.Mock } }).client
        .verifyIdToken;
    });

    it('should throw UnauthorizedException when authorization header is missing', async () => {
      const context = mockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when authorization header does not start with Bearer', async () => {
      const context = mockExecutionContext('Basic some-token');

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token payload is empty', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => null,
      });

      const context = mockExecutionContext('Bearer valid-token');

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when email is not verified', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email_verified: false,
          email: expectedSigningAccount,
        }),
      });

      const context = mockExecutionContext('Bearer valid-token');

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when email does not match expected account', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email_verified: true,
          email: 'wrong@example.com',
        }),
      });

      const context = mockExecutionContext('Bearer valid-token');

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('should return true when token is valid and email matches', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          email_verified: true,
          email: expectedSigningAccount,
        }),
      });

      const context = mockExecutionContext('Bearer valid-token');

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockVerifyIdToken).toHaveBeenCalledWith({
        idToken: 'valid-token',
        audience: expectedAudience,
      });
    });
  });
});
