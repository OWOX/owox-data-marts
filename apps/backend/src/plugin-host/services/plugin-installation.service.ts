import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUniqueConstraintViolation } from '../../common/typeorm/query-error.utils';
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

  /**
   * Installs, or returns the row a concurrent request wrote first.
   *
   * A double-click sends two firsts: both read no installation, both insert, and
   * UQ_plugin_installation refuses the second. The refusal means the member is installed
   * -- which is what they asked for -- so re-reading is the answer, not a 500.
   */
  async installOrFind(
    pluginId: string,
    projectId: string,
    userId: string
  ): Promise<{ installation: PluginInstallation; wonRace: boolean }> {
    try {
      return { installation: await this.install(pluginId, projectId, userId), wonRace: true };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      const existing = await this.findOne(pluginId, projectId, userId);
      if (!existing) {
        // Some other constraint that merely looks like this one; the caller should see it.
        throw error;
      }

      return { installation: existing, wonRace: false };
    }
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
