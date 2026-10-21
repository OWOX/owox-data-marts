import type { Repository } from 'typeorm';
import { PluginInstallation } from '../entities/plugin-installation.entity';
import { InstallationInactiveError } from '../errors/plugin-action.errors';

/** Must run first in its transaction: it serializes starts, and an earlier read would pin a stale snapshot. */
export async function lockActiveInstallation(
  installations: Repository<PluginInstallation>,
  installationId: string
): Promise<void> {
  const lock = await installations
    .createQueryBuilder()
    .update(PluginInstallation)
    .set({ modifiedAt: () => 'modifiedAt' })
    .where('id = :id', { id: installationId })
    .andWhere('uninstalledAt IS NULL')
    .execute();
  if (lock.affected !== 1) {
    throw new InstallationInactiveError();
  }
}
