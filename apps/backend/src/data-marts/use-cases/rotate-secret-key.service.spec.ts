import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { RotateSecretKeyCommand } from '../dto/domain/rotate-secret-key.command';
import { Action, EntityType } from '../services/access-decision';
import { RotateSecretKeyService } from './rotate-secret-key.service';

describe('RotateSecretKeyService', () => {
  const command = new RotateSecretKeyCommand('destination', 'project', 'user', ['editor']);
  const destination = {
    id: 'destination',
    title: 'Looker reports',
    type: DataDestinationType.LOOKER_STUDIO,
    projectId: 'project',
    credentialId: 'credential',
  };
  const currentCredentials = {
    type: 'looker-studio-credentials',
    destinationSecretKey: 'old-key',
  };
  const rotatedCredentials = {
    type: 'looker-studio-credentials',
    destinationSecretKey: 'new-key',
  };

  function create() {
    const repository = { findOne: jest.fn().mockResolvedValue(destination) };
    const mapper = { toDomainDto: jest.fn().mockResolvedValue({ id: 'destination' }) };
    const rotator = { rotateSecretKey: jest.fn().mockResolvedValue(rotatedCredentials) };
    const credentials = {
      getById: jest.fn().mockResolvedValue({ id: 'credential', credentials: currentCredentials }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const access = { canAccess: jest.fn().mockResolvedValue(true) };
    const service = new RotateSecretKeyService(
      repository as never,
      mapper as never,
      rotator as never,
      credentials as never,
      access as never
    );
    return { service, repository, mapper, rotator, credentials, access };
  }

  it('checks project-scoped EDIT access and writes the rotated credentials', async () => {
    const { service, repository, mapper, rotator, credentials, access } = create();

    await expect(service.run(command)).resolves.toEqual({ id: 'destination' });

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'destination', projectId: 'project' },
    });
    expect(access.canAccess).toHaveBeenCalledWith(
      'user',
      ['editor'],
      EntityType.DESTINATION,
      'destination',
      Action.EDIT,
      'project'
    );
    expect(credentials.getById).toHaveBeenCalledWith('credential');
    expect(rotator.rotateSecretKey).toHaveBeenCalledWith(
      DataDestinationType.LOOKER_STUDIO,
      currentCredentials
    );
    expect(credentials.update).toHaveBeenCalledWith('credential', {
      credentials: { type: 'looker-studio-credentials', destinationSecretKey: 'new-key' },
    });
    expect(mapper.toDomainDto).toHaveBeenCalledWith(destination);
  });

  it('returns not found without reading credentials for a missing or foreign Destination', async () => {
    const { service, repository, rotator, credentials, access } = create();
    repository.findOne.mockResolvedValue(null);

    await expect(service.run(command)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'destination', projectId: 'project' },
    });
    expect(access.canAccess).not.toHaveBeenCalled();
    expect(credentials.getById).not.toHaveBeenCalled();
    expect(rotator.rotateSecretKey).not.toHaveBeenCalled();
    expect(credentials.update).not.toHaveBeenCalled();
  });

  it.each([DataDestinationType.LOOKER_STUDIO, DataDestinationType.GOOGLE_SHEETS])(
    'requires EDIT before inspecting type or reading credentials: %s',
    async type => {
      const { service, repository, rotator, credentials, access } = create();
      repository.findOne.mockResolvedValue({ ...destination, type });
      access.canAccess.mockResolvedValue(false);

      await expect(service.run(command)).rejects.toBeInstanceOf(ForbiddenException);
      expect(credentials.getById).not.toHaveBeenCalled();
      expect(rotator.rotateSecretKey).not.toHaveBeenCalled();
      expect(credentials.update).not.toHaveBeenCalled();
    }
  );

  it('rejects rotation for a destination that does not use a Looker Studio key', async () => {
    const { service, repository, rotator, credentials } = create();
    repository.findOne.mockResolvedValue({
      ...destination,
      type: DataDestinationType.GOOGLE_SHEETS,
    });

    await expect(service.run(command)).rejects.toBeInstanceOf(BadRequestException);
    expect(credentials.getById).not.toHaveBeenCalled();
    expect(rotator.rotateSecretKey).not.toHaveBeenCalled();
    expect(credentials.update).not.toHaveBeenCalled();
  });

  it('checks current EDIT access before each rotation', async () => {
    const { service, rotator, credentials, access } = create();
    access.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await service.run(command);
    await expect(service.run(command)).rejects.toBeInstanceOf(ForbiddenException);

    expect(access.canAccess).toHaveBeenCalledTimes(2);
    expect(credentials.getById).toHaveBeenCalledTimes(1);
    expect(rotator.rotateSecretKey).toHaveBeenCalledTimes(1);
    expect(credentials.update).toHaveBeenCalledTimes(1);
  });

  it('rotates and persists a new key on every authorized call', async () => {
    const { service, rotator, credentials } = create();
    rotator.rotateSecretKey
      .mockResolvedValueOnce({ ...rotatedCredentials, destinationSecretKey: 'first-key' })
      .mockResolvedValueOnce({ ...rotatedCredentials, destinationSecretKey: 'second-key' });

    await service.run(command);
    await service.run(command);

    expect(credentials.update).toHaveBeenNthCalledWith(1, 'credential', {
      credentials: { type: 'looker-studio-credentials', destinationSecretKey: 'first-key' },
    });
    expect(credentials.update).toHaveBeenNthCalledWith(2, 'credential', {
      credentials: { type: 'looker-studio-credentials', destinationSecretKey: 'second-key' },
    });
  });

  it('does not write credentials when rotation fails', async () => {
    const { service, rotator, credentials, mapper } = create();
    const error = new Error('Rotation failed');
    rotator.rotateSecretKey.mockRejectedValue(error);

    await expect(service.run(command)).rejects.toBe(error);
    expect(credentials.update).not.toHaveBeenCalled();
    expect(mapper.toDomainDto).not.toHaveBeenCalled();
  });

  it('does not report success when saving the new key fails', async () => {
    const { service, credentials, mapper } = create();
    const error = new Error('Save failed');
    credentials.update.mockRejectedValue(error);

    await expect(service.run(command)).rejects.toBe(error);
    expect(mapper.toDomainDto).not.toHaveBeenCalled();
  });
});
