import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ProjectBinding } from '../../../common/config/app-edition-config.service';
import {
  JwksUnavailableError,
  verifyJwtClaims,
} from '../../../common/jwt-body/google-jwt-body.decorator';
import { LicenseKey } from '../entities/license-key.entity';
import { LicenseKeyService } from '../services/license-key.service';
import { LicenseKeyGuard, LicensedRequest } from './license-key.guard';

jest.mock('../../../common/jwt-body/google-jwt-body.decorator', () => ({
  ...jest.requireActual('../../../common/jwt-body/google-jwt-body.decorator'),
  verifyJwtClaims: jest.fn(),
}));

const verifyJwtClaimsMock = verifyJwtClaims as jest.MockedFunction<typeof verifyJwtClaims>;

const ACTIVE_RECORD = {
  licenseKeyId: 'key-1',
  projectId: 'cloud-project',
  origin: 'https://customer.test',
} as LicenseKey;

function claims(overrides: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
  return {
    iss: 'license@owox-registry.iam.gserviceaccount.com',
    jti: 'key-1',
    aud: 'https://customer.test',
    ...overrides,
    payload: {
      projectBinding: ProjectBinding.LICENSE,
      billingProjectId: 'cloud-project',
      ...payload,
    },
  };
}

function contextOf(headers: Record<string, string | undefined>): {
  context: ExecutionContext;
  request: LicensedRequest;
} {
  const request = { headers } as unknown as LicensedRequest;
  return {
    context: { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext,
    request,
  };
}

function validHeaders() {
  return { authorization: 'Bearer the-jwt', 'x-owox-license-key-id': 'key-1' };
}

describe('LicenseKeyGuard', () => {
  let licenseKeyService: jest.Mocked<LicenseKeyService>;
  let guard: LicenseKeyGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    licenseKeyService = {
      findActive: jest.fn().mockResolvedValue(ACTIVE_RECORD),
      markUsed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<LicenseKeyService>;
    guard = new LicenseKeyGuard(licenseKeyService);
    verifyJwtClaimsMock.mockResolvedValue(claims());
  });

  it('attaches the verified managed record to the request', async () => {
    const { context, request } = contextOf(validHeaders());

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.licenseKey).toBe(ACTIVE_RECORD);
    expect(licenseKeyService.findActive).toHaveBeenCalledWith('key-1', 'cloud-project');
    expect(licenseKeyService.markUsed).toHaveBeenCalledWith('key-1');
  });

  it('does not fail the request when stamping last activity fails', async () => {
    licenseKeyService.markUsed.mockRejectedValue(new Error('db down'));

    await expect(guard.canActivate(contextOf(validHeaders()).context)).resolves.toBe(true);
  });

  it.each([
    ['a missing Authorization header', { 'x-owox-license-key-id': 'key-1' }],
    ['a malformed Authorization header', { authorization: 'the-jwt', ...{} }],
    ['a missing key identifier header', { authorization: 'Bearer the-jwt' }],
  ])('rejects %s', async (_name, headers) => {
    await expect(guard.canActivate(contextOf(headers).context)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('rejects a key identifier header that does not match the JWT jti', async () => {
    const { context } = contextOf({
      authorization: 'Bearer the-jwt',
      'x-owox-license-key-id': 'other-key',
    });

    await expect(guard.canActivate(context)).rejects.toThrow('does not match the license');
  });

  it('rejects an INTERNAL binding key', async () => {
    verifyJwtClaimsMock.mockResolvedValue(
      claims({}, { projectBinding: ProjectBinding.INTERNAL, billingProjectId: undefined })
    );

    await expect(guard.canActivate(contextOf(validHeaders()).context)).rejects.toThrow(
      'cannot use the license gateway'
    );
  });

  it('rejects a key whose signature does not verify', async () => {
    verifyJwtClaimsMock.mockRejectedValue(new Error('bad signature'));

    await expect(guard.canActivate(contextOf(validHeaders()).context)).rejects.toThrow(
      'License key is not valid'
    );
  });

  it('reports JWKS infrastructure failure as retryable unavailability', async () => {
    verifyJwtClaimsMock.mockRejectedValue(new JwksUnavailableError('jwks unavailable'));

    await expect(guard.canActivate(contextOf(validHeaders()).context)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });

  it('rejects a revoked, expired or unknown key', async () => {
    licenseKeyService.findActive.mockResolvedValue(null);

    await expect(guard.canActivate(contextOf(validHeaders()).context)).rejects.toThrow(
      'revoked, expired, or unknown'
    );
  });

  it('rejects a key presented from a different origin', async () => {
    verifyJwtClaimsMock.mockResolvedValue(claims({ aud: 'https://attacker.test' }));

    await expect(guard.canActivate(contextOf(validHeaders()).context)).rejects.toThrow(
      'issued for a different origin'
    );
  });

  it('rejects a key whose billing project does not own the record', async () => {
    verifyJwtClaimsMock.mockResolvedValue(claims({}, { billingProjectId: 'other-project' }));
    licenseKeyService.findActive.mockResolvedValue(null);

    await expect(guard.canActivate(contextOf(validHeaders()).context)).rejects.toThrow(
      'revoked, expired, or unknown'
    );
    expect(licenseKeyService.findActive).toHaveBeenCalledWith('key-1', 'other-project');
  });
});
