import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PluginInstallation } from '../entities/plugin-installation.entity';

/**
 * Repository access for member installations.
 *
 * Installations are never deleted. A soft uninstall keeps the row so a member can
 * restore it later -- including when no publication makes the plugin visible any more,
 * which is the whole reason the history survives.
 */
@Injectable()
export class PluginInstallationService {
  constructor(
    @InjectRepository(PluginInstallation)
    private readonly repository: Repository<PluginInstallation>
  ) {}

  findById(id: string): Promise<PluginInstallation | null> {
    return this.repository.findOneBy({ id });
  }

  findOne(pluginId: string, projectId: string, userId: string): Promise<PluginInstallation | null> {
    return this.repository.findOneBy({ pluginId, projectId, userId });
  }

  /** Every installation this member has ever made in this project, active or not. */
  findByMember(projectId: string, userId: string): Promise<PluginInstallation[]> {
    return this.repository.findBy({ projectId, userId });
  }

  install(pluginId: string, projectId: string, userId: string): Promise<PluginInstallation> {
    // createdAt is set by @CreateDateColumn and is never written again, so it keeps
    // meaning "first ever installation" across any number of uninstall/restore cycles.
    return this.repository.save(
      this.repository.create({ pluginId, projectId, userId, installedAt: new Date() })
    );
  }

  async restore(installationId: string): Promise<void> {
    await this.repository.update(installationId, {
      installedAt: new Date(),
      uninstalledAt: null,
    });
  }

  async uninstall(installationId: string): Promise<void> {
    await this.repository.update(installationId, { uninstalledAt: new Date() });
  }
}
