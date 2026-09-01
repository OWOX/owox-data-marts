import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { isUniqueConstraintViolation } from '../../common/typeorm/query-error.utils';
import { PluginVersion } from '../entities/plugin-version.entity';
import { Plugin } from '../entities/plugin.entity';
import { PluginVersionConflictError } from '../errors/plugin-host.errors';
import type { PluginCollectionDeclaration } from '../utils/plugin-manifest.util';
import type { StoredCredentialRequirement } from '../../data-marts/credentials/credential.types';

export interface InsertPluginVersionInput {
  readonly pluginId: string;
  readonly semver: string;
  readonly commitSha: string;
  readonly githubReleaseId: string;
  readonly tagName: string;
  readonly displayName: string;
  readonly description: string;
  readonly deliveryUrl: string;
  readonly collections: readonly PluginCollectionDeclaration[];
  readonly credentialRequirements: readonly StoredCredentialRequirement[];
  readonly releasePublishedAt: Date | null;
}

/**
 * Insert-only. There is deliberately no update or delete path anywhere, which is what
 * makes "recorded version metadata cannot be mutated" structural rather than a rule
 * someone has to remember.
 */
@Injectable()
export class PluginVersionService {
  constructor(
    @InjectRepository(PluginVersion)
    private readonly repository: Repository<PluginVersion>,
    @InjectRepository(Plugin)
    private readonly plugins: Repository<Plugin>,
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  findById(id: string): Promise<PluginVersion | null> {
    return this.repository.findOneBy({ id });
  }

  /** Bulk form for list surfaces, so a Gallery of N plugins stays one query. */
  findByIds(ids: readonly string[]): Promise<PluginVersion[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.repository.findBy({ id: In([...ids]) });
  }

  findAllByPluginId(pluginId: string): Promise<PluginVersion[]> {
    return this.repository.findBy({ pluginId });
  }

  findBySemver(pluginId: string, semver: string): Promise<PluginVersion | null> {
    return this.repository.findOneBy({ pluginId, semver });
  }

  /** @throws {PluginVersionConflictError} when a concurrent sync recorded this SemVer first. */
  async insertVersion(input: InsertPluginVersionInput): Promise<PluginVersion> {
    try {
      return await this.repository.save(
        this.repository.create({
          ...input,
          collections: [...input.collections],
          credentialRequirements: [...input.credentialRequirements],
          deliveryType: 'remote',
        })
      );
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new PluginVersionConflictError(input.semver, 'unknown', input.commitSha);
      }
      throw error;
    }
  }

  /** Inserts only while this worker still owns the plugin's sync lease. */
  @Transactional()
  async insertVersionForLease(
    input: InsertPluginVersionInput,
    leaseId: string
  ): Promise<PluginVersion | null> {
    const query = this.plugins
      .createQueryBuilder('plugin')
      .where('plugin.id = :pluginId', { pluginId: input.pluginId });
    if (this.dataSource.options.type === 'mysql') query.setLock('pessimistic_write');
    const plugin = await query.getOne();
    if (!plugin || plugin.syncLeaseId !== leaseId) return null;
    return this.insertVersion(input);
  }
}
