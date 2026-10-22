import type { Repository } from 'typeorm';
import type { PluginInstallation } from '../entities/plugin-installation.entity';
import { InstallationInactiveError } from '../errors/plugin-action.errors';
import { lockActiveInstallation } from './installation-lock.util';

function setup(affected: number) {
  const builder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
  const installations = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
  } as unknown as Repository<PluginInstallation>;
  return { builder, installations };
}

describe('lockActiveInstallation', () => {
  it('resolves when it locked the one active installation', async () => {
    const { builder, installations } = setup(1);

    await expect(lockActiveInstallation(installations, 'installation-1')).resolves.toBeUndefined();
    expect(builder.where).toHaveBeenCalledWith('id = :id', { id: 'installation-1' });
    expect(builder.andWhere).toHaveBeenCalledWith('uninstalledAt IS NULL');
  });

  it.each([0, 2, undefined])(
    'throws InstallationInactiveError when affected is %s',
    async affected => {
      const { installations } = setup(affected as number);

      await expect(lockActiveInstallation(installations, 'installation-1')).rejects.toBeInstanceOf(
        InstallationInactiveError
      );
    }
  );
});
