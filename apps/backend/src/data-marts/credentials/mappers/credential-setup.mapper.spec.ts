import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { CredentialSetupMapper } from './credential-setup.mapper';

describe('CredentialSetupMapper presentation boundary', () => {
  const now = new Date('2026-11-02T12:00:00.000Z');
  const mapper = new CredentialSetupMapper({ now: () => now } as SystemTimeService);

  it('does not copy internal fields from the domain result into the API response', () => {
    const result = mapper.toResponse({
      id: 'setup',
      mode: 'create',
      status: 'pending',
      definitionId: 'provider',
      credentialId: null,
      title: 'My account',
      createdAt: now,
      expiresAt: new Date('2026-11-02T12:15:00.000Z'),
      completedAt: null,
      projectId: 'internal-project',
      userId: 'internal-user',
      secret: 'provider-material',
    } as Parameters<typeof mapper.toResponse>[0]);

    expect(result).toEqual({
      id: 'setup',
      mode: 'create',
      status: 'pending',
      definitionId: 'provider',
      credentialId: null,
      title: 'My account',
      createdAt: now,
      expiresAt: new Date('2026-11-02T12:15:00.000Z'),
      completedAt: null,
    });
  });
});
