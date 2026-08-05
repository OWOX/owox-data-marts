import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { isUniqueConstraintViolation } from '../../common/typeorm/query-error.utils';
import { GithubRepoDto } from '../dto/domain/github-repo.dto';
import { SyncReport } from '../dto/domain/plugin-sync.dto';
import { Plugin } from '../entities/plugin.entity';

@Injectable()
export class PluginService {
  constructor(
    @InjectRepository(Plugin)
    private readonly repository: Repository<Plugin>
  ) {}

  /** Lookup by the identity anchor. Owner and name are never used to find a plugin. */
  findByGithubRepoId(githubRepoId: string): Promise<Plugin | null> {
    return this.repository.findOneBy({ githubRepoId });
  }

  findById(id: string): Promise<Plugin | null> {
    return this.repository.findOneBy({ id });
  }

  /** Bulk form for list surfaces, so a Gallery of N plugins stays one query. */
  findByIds(ids: readonly string[]): Promise<Plugin[]> {
    return ids.length === 0 ? Promise.resolve([]) : this.repository.findBy({ id: In([...ids]) });
  }

  /**
   * Finds a known plugin from its cached owner and name, without asking GitHub.
   *
   * Identity still belongs to the numeric repository id; this is a local shortcut for
   * operations that must keep working when GitHub is unreachable -- above all the
   * emergency kill switch, which is needed precisely when something is going wrong.
   * The cached name is refreshed on every sync, so it is current for any plugin we
   * have ever successfully read.
   */
  findByRepoName(owner: string, name: string): Promise<Plugin | null> {
    return this.repository.findOneBy({ repoOwner: owner, repoName: name });
  }

  async setSuspension(
    pluginId: string,
    suspendedAt: Date | null,
    apiKeyId: string | null,
    note: string | null
  ): Promise<void> {
    await this.repository.update(pluginId, {
      suspendedAt,
      suspendedByApiKeyId: suspendedAt ? apiKeyId : null,
      suspensionNote: note,
    });
  }

  /**
   * Creates, or returns the row a concurrent publish wrote first.
   *
   * Two first publishes of the same repository both read nothing and both insert;
   * UQ_plugin_github_repo_id refuses the second. Since identity is the repository id, the
   * winner's row *is* the answer -- re-reading keeps publish idempotent as documented.
   */
  async createOrFindForRepo(repo: GithubRepoDto): Promise<Plugin> {
    try {
      return await this.createForRepo(repo);
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      const existing = await this.findByGithubRepoId(repo.githubRepoId);
      if (!existing) {
        throw error;
      }

      return existing;
    }
  }

  createForRepo(repo: GithubRepoDto): Promise<Plugin> {
    return this.repository.save(
      this.repository.create({
        githubRepoId: repo.githubRepoId,
        repoOwner: repo.owner,
        repoName: repo.name,
        repoHtmlUrl: repo.htmlUrl,
        isPrivateRepo: repo.isPrivate,
      })
    );
  }

  /** Keeps cached management metadata current after a rename, transfer or visibility change. */
  async syncRepoNaming(pluginId: string, repo: GithubRepoDto): Promise<void> {
    await this.repository.update(pluginId, {
      repoOwner: repo.owner,
      repoName: repo.name,
      repoHtmlUrl: repo.htmlUrl,
      isPrivateRepo: repo.isPrivate,
    });
  }

  /**
   * Atomic compare-and-set on lastSyncAt.
   *
   * One statement doing two jobs: the per-plugin rate limit, and the "last synced"
   * timestamp the publisher view wants anyway. There is no Redis in this codebase and
   * this needs none.
   *
   * NOTE: a rate limiter, not a mutex -- a sync that outlives the interval can overlap
   * the next one, which is why version inserts treat a unique violation as a rejection
   * rather than an error. Upgrade path is a nullable syncStartedAt lease with staleness
   * reclaim, not Redis. A crashed sync likewise holds the slot for the full interval
   * before a retry is allowed.
   */
  async tryClaimSyncSlot(pluginId: string, minIntervalMs: number): Promise<boolean> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Plugin)
      .set({ lastSyncAt: new Date() })
      .where('id = :pluginId', { pluginId })
      .andWhere('(lastSyncAt IS NULL OR lastSyncAt <= :cutoff)', {
        cutoff: new Date(Date.now() - minIntervalMs),
      })
      .execute();

    return (result.affected ?? 0) > 0;
  }

  /**
   * Last writer wins on currentVersionId rather than read-modify-write, so two
   * overlapping syncs cannot lose one another's work in a lost update.
   */
  async saveSyncOutcome(
    pluginId: string,
    currentVersionId: string | null,
    report: SyncReport
  ): Promise<void> {
    await this.repository.update(pluginId, { currentVersionId, lastSyncReport: report });
  }
}
