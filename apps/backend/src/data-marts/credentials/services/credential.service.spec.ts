import { CredentialService } from './credential.service';

describe('CredentialService usage metadata', () => {
  it('derives aggregate last use from the newest consumer binding', async () => {
    const usedAt = new Date('2026-08-27T10:00:00.000Z');
    const bindings = { findOne: jest.fn().mockResolvedValue({ lastUsedAt: usedAt }) };
    const service = new CredentialService({} as never, bindings as never);

    await expect(service.getLastUsedAt('credential-1')).resolves.toEqual(usedAt);
    expect(bindings.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ credentialId: 'credential-1' }),
        order: { lastUsedAt: 'DESC' },
        select: { lastUsedAt: true },
      })
    );
  });

  it('acquires a cross-database write lock without changing Credential data', async () => {
    const credential = { id: 'credential-1', projectId: 'project-1' };
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnValue({ andWhere });
    andWhere.mockReturnValueOnce({ andWhere }).mockReturnValueOnce({ execute });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const createQueryBuilder = jest.fn().mockReturnValue({ update });
    const findOne = jest.fn().mockResolvedValue(credential);
    const service = new CredentialService({ createQueryBuilder, findOne } as never, {} as never);

    await expect(service.lockActiveByIdAndProjectId('credential-1', 'project-1')).resolves.toBe(
      credential
    );

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ modifiedAt: expect.any(Function) });
    expect(execute).toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'credential-1', projectId: 'project-1' } })
    );
  });

  it('does not reuse a stale transaction snapshot when the locking update misses', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 0 });
    const andWhere = jest.fn().mockReturnThis();
    const where = jest.fn().mockReturnValue({ andWhere });
    andWhere.mockReturnValueOnce({ andWhere }).mockReturnValueOnce({ execute });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const findOne = jest.fn();
    const service = new CredentialService(
      { createQueryBuilder: jest.fn().mockReturnValue({ update }), findOne } as never,
      {} as never
    );

    await expect(
      service.lockActiveByIdAndProjectId('credential-1', 'project-1')
    ).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe('CredentialService validation writes', () => {
  const checked = { value: 'checked-key' };
  const result = {
    state: 'verified',
    message: 'ok',
    validatedAt: new Date('2026-09-01T12:00:00.000Z'),
  } as const;

  function repo(stored: unknown) {
    return {
      findOne: jest.fn().mockResolvedValue(stored),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
  }

  it('writes only the validation columns while the stored secret is the checked one', async () => {
    const credentials = repo({ secret: { value: 'checked-key' } });
    const service = new CredentialService(credentials as never, {} as never);

    await service.writeValidation('credential-1', checked, result);

    expect(credentials.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'credential-1' } })
    );
    expect(credentials.update).toHaveBeenCalledWith(
      { id: 'credential-1' },
      { validationState: 'verified', validationMessage: 'ok', validatedAt: result.validatedAt }
    );
  });

  it('writes nothing when the key was replaced or the Credential is gone', async () => {
    for (const stored of [{ secret: { value: 'new-key' } }, null]) {
      const credentials = repo(stored);
      const service = new CredentialService(credentials as never, {} as never);

      await service.writeValidation('credential-1', checked, result);

      expect(credentials.update).not.toHaveBeenCalled();
    }
  });

  it('marks rejected only for the key Google refused, with the message cut to 2000', async () => {
    const credentials = repo({ secret: { value: 'checked-key' }, validationState: 'verified' });
    const service = new CredentialService(credentials as never, {} as never);

    await service.markRejected('credential-1', checked, 'x'.repeat(2500));

    expect(credentials.update).toHaveBeenCalledWith(
      { id: 'credential-1' },
      {
        validationState: 'rejected',
        validationMessage: 'x'.repeat(2000),
        validatedAt: expect.any(Date),
      }
    );
  });

  it('does not mark a replaced key rejected', async () => {
    const credentials = repo({ secret: { value: 'new-key' }, validationState: 'verified' });
    const service = new CredentialService(credentials as never, {} as never);

    await service.markRejected('credential-1', checked, 'invalid_grant');

    expect(credentials.update).not.toHaveBeenCalled();
  });

  it('does not write again when already rejected with the same message', async () => {
    const credentials = repo({
      secret: { value: 'checked-key' },
      validationState: 'rejected',
      validationMessage: 'invalid_grant',
    });
    const service = new CredentialService(credentials as never, {} as never);

    await service.markRejected('credential-1', checked, 'invalid_grant');

    expect(credentials.update).not.toHaveBeenCalled();
  });
});
