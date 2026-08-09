import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyJwtClaims } from '../jwt-body/google-jwt-body.decorator';
import { AppEdition, AppEditionConfig, ProjectBinding } from './app-edition-config.service';
import { PublicOriginService } from './public-origin.service';

jest.mock('../jwt-body/google-jwt-body.decorator', () => ({
  verifyJwtClaims: jest.fn(),
}));

const verifyJwtClaimsMock = verifyJwtClaims as jest.MockedFunction<typeof verifyJwtClaims>;

const FUTURE_EXPIRY = Math.floor(Date.now() / 1000) + 3600;

describe('AppEditionConfig', () => {
  let config: ConfigService;
  let publicOriginService: PublicOriginService;
  let errorSpy: jest.SpyInstance;

  function buildConfig(env: Record<string, unknown>): AppEditionConfig {
    const values: Record<string, unknown> = { ...env };
    config = {
      get: jest.fn((key: string) => values[key]),
      set: jest.fn((key: string, value: unknown) => {
        values[key] = value;
      }),
    } as unknown as ConfigService;
    publicOriginService = new PublicOriginService(config);
    return new AppEditionConfig(config, publicOriginService);
  }

  function claims(payload: Record<string, unknown>, jti: string | undefined = 'key-1') {
    return { iss: 'license@owox-registry.iam.gserviceaccount.com', jti, payload };
  }

  function cloudBilledClaims(overrides: Record<string, unknown> = {}) {
    return claims({
      licensedAppEdition: AppEdition.CLOUD_BILLED_ENTERPRISE,
      projectBinding: ProjectBinding.INTERNAL,
      licenseExpiresAt: FUTURE_EXPIRY,
      ...overrides,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back to COMMUNITY without a license key', async () => {
    const service = buildConfig({});

    await service.actualizeAppEdition();

    expect(service.isEnterpriseEdition()).toBe(false);
    expect(service.getLicenseContext()).toBeNull();
    expect(config.set).toHaveBeenCalledWith('LICENSED_APP_EDITION', AppEdition.COMMUNITY);
    expect(verifyJwtClaimsMock).not.toHaveBeenCalled();
  });

  it('validates the key against the normalized public origin', async () => {
    const service = buildConfig({ LICENSE_KEY: 'jwt', PUBLIC_ORIGIN: 'https://app.owox.test/ui/' });
    verifyJwtClaimsMock.mockResolvedValue(cloudBilledClaims());

    await service.actualizeAppEdition();

    expect(verifyJwtClaimsMock).toHaveBeenCalledWith(
      'jwt',
      'license@owox-registry.iam.gserviceaccount.com',
      'https://app.owox.test'
    );
  });

  it('validates against localhost when PUBLIC_ORIGIN is absent', async () => {
    const service = buildConfig({ LICENSE_KEY: 'jwt', PORT: 3000 });
    verifyJwtClaimsMock.mockResolvedValue(cloudBilledClaims());

    await service.actualizeAppEdition();

    expect(verifyJwtClaimsMock).toHaveBeenCalledWith(
      'jwt',
      expect.any(String),
      'http://localhost:3000'
    );
  });

  it('activates CLOUD_BILLED_ENTERPRISE for an INTERNAL binding', async () => {
    const service = buildConfig({ LICENSE_KEY: 'jwt' });
    verifyJwtClaimsMock.mockResolvedValue(cloudBilledClaims());

    await service.actualizeAppEdition();

    expect(service.isEnterpriseEdition()).toBe(true);
    expect(service.getLicenseContext()).toEqual({
      binding: ProjectBinding.INTERNAL,
      licenseKeyId: 'key-1',
    });
  });

  it('activates CLOUD_BILLED_ENTERPRISE for a LICENSE binding with billingProjectId', async () => {
    const service = buildConfig({ LICENSE_KEY: 'jwt' });
    verifyJwtClaimsMock.mockResolvedValue(
      cloudBilledClaims({ projectBinding: ProjectBinding.LICENSE, billingProjectId: 'project-42' })
    );

    await service.actualizeAppEdition();

    expect(service.getLicenseContext()).toMatchObject({
      binding: ProjectBinding.LICENSE,
    });
  });

  it.each([
    [
      'legacy ENTERPRISE edition',
      cloudBilledClaims({ licensedAppEdition: 'ENTERPRISE' }),
      'Legacy ENTERPRISE license keys are no longer supported',
    ],
    [
      'unknown edition',
      cloudBilledClaims({ licensedAppEdition: 'SOMETHING' }),
      'Unsupported licensed app edition',
    ],
    ['missing jti', { ...cloudBilledClaims(), jti: undefined }, 'missing the jti identifier'],
    [
      'unknown binding',
      cloudBilledClaims({ projectBinding: 'OTHER' }),
      'Unsupported project binding',
    ],
    [
      'LICENSE binding without billingProjectId',
      cloudBilledClaims({ projectBinding: ProjectBinding.LICENSE }),
      'requires billingProjectId',
    ],
    [
      'INTERNAL binding with billingProjectId',
      cloudBilledClaims({ billingProjectId: 'project-42' }),
      'must not carry billingProjectId',
    ],
    ['missing expiry', cloudBilledClaims({ licenseExpiresAt: undefined }), 'licenseExpiresAt'],
    [
      'expired license',
      cloudBilledClaims({ licenseExpiresAt: Math.floor(Date.now() / 1000) - 10 }),
      'License expired at',
    ],
  ])('rejects %s', async (_name, payload, expectedReason) => {
    const service = buildConfig({ LICENSE_KEY: 'jwt' });
    verifyJwtClaimsMock.mockResolvedValue(payload);

    await service.actualizeAppEdition();

    expect(service.isEnterpriseEdition()).toBe(false);
    expect(service.getLicenseContext()).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(expectedReason));
  });

  it('falls back to COMMUNITY when signature verification fails', async () => {
    const service = buildConfig({ LICENSE_KEY: 'jwt' });
    verifyJwtClaimsMock.mockRejectedValue(new Error('jwt audience invalid'));

    await service.actualizeAppEdition();

    expect(service.isEnterpriseEdition()).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('jwt audience invalid'));
  });

  it('never logs the raw license key', async () => {
    const service = buildConfig({ LICENSE_KEY: 'super-secret-jwt' });
    verifyJwtClaimsMock.mockRejectedValue(new Error('boom'));

    await service.actualizeAppEdition();

    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('super-secret-jwt');
  });

  it('throws when the edition is read before initialization', () => {
    const service = buildConfig({});

    expect(() => service.isEnterpriseEdition()).toThrow('App Edition is not initialized');
  });
});
