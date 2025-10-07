import { BadRequestException } from '@nestjs/common';
import { IntercomController } from './intercom.controller';
import type { AuthorizationContext } from '../types';
import { IssueIntercomJwtService } from '../use-cases/issue-intercom-jwt.service';
import { IntercomMapper } from '../mappers/intercom.mapper';
import { IssueIntercomJwtCommand } from '../dto/domain/issue-intercom-jwt.command';

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
  let useCase: jest.Mocked<IssueIntercomJwtService>;
  let mapper: jest.Mocked<IntercomMapper>;

  const makeCtx = (overrides: Partial<AuthorizationContext> = {}): AuthorizationContext => ({
    userId: 'user-123',
    email: 'user@example.com',
    fullName: 'John Doe',
    projectId: 'project-456',
    projectTitle: 'My Project',
    ...overrides,
  });

  beforeEach(() => {
    useCase = {
      run: jest.fn(),
    } as unknown as jest.Mocked<IssueIntercomJwtService>;

    mapper = {
      toIssueJwtCommand: jest.fn(),
      toResponse: jest.fn(),
    } as unknown as jest.Mocked<IntercomMapper>;

    controller = new IntercomController(useCase, mapper);

    jest.clearAllMocks();
  });

  it('should propagate BadRequestException from use-case', async () => {
    const ctx = makeCtx();
    const command: IssueIntercomJwtCommand = { userId: ctx.userId };
    mapper.toIssueJwtCommand.mockReturnValueOnce(command);
    useCase.run.mockRejectedValueOnce(
      new BadRequestException('INTERCOM_SECRET_KEY is not configured')
    );

    await expect(controller.issueJwt(ctx)).rejects.toEqual(
      new BadRequestException('INTERCOM_SECRET_KEY is not configured')
    );

    expect(mapper.toIssueJwtCommand).toHaveBeenCalledWith(ctx);
    expect(useCase.run).toHaveBeenCalledWith(command);
  });

  it('should map and return token from use-case on success', async () => {
    const ctx = makeCtx();
    const command: IssueIntercomJwtCommand = { userId: ctx.userId };
    mapper.toIssueJwtCommand.mockReturnValueOnce(command);
    useCase.run.mockResolvedValueOnce({ token: 'signed-token' });
    mapper.toResponse.mockReturnValueOnce({ token: 'signed-token' });

    const result = await controller.issueJwt(ctx);

    expect(result).toEqual({ token: 'signed-token' });
    expect(mapper.toIssueJwtCommand).toHaveBeenCalledTimes(1);
    expect(useCase.run).toHaveBeenCalledTimes(1);
    expect(mapper.toResponse).toHaveBeenCalledTimes(1);
    expect(useCase.run).toHaveBeenCalledWith(command);
  });
});
