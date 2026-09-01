import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Transactional } from 'typeorm-transactional';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { assertPublicHttpUrl } from '../../../common/helpers/safe-url.helper';
import { isUniqueConstraintViolation } from '../../../common/typeorm/query-error.utils';
import type { CredentialDefinitionContract } from '../credential.types';
import type { ResolvedCredentialDefinition } from '../dto/credential-api.dto';
import { CredentialDefinitionVersion } from '../entities/credential-definition-version.entity';
import { CredentialExternalDefinition } from '../entities/credential-external-definition.entity';

export interface RegisterExternalCredentialDefinitionInput {
  readonly githubRepoId: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly semver: string;
  readonly commitSha: string;
  readonly githubReleaseId: string;
  readonly tagName: string;
  readonly contract: CredentialDefinitionContract;
}

const SLOT_MINUTES = 5;
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CredentialExternalDefinitionRegistryService {
  constructor(
    @InjectRepository(CredentialExternalDefinition)
    private readonly definitions: Repository<CredentialExternalDefinition>,
    @InjectRepository(CredentialDefinitionVersion)
    private readonly versions: Repository<CredentialDefinitionVersion>,
    @InjectDataSource()
    private readonly dataSource: DataSource
  ) {}

  async register(
    input: RegisterExternalCredentialDefinitionInput
  ): Promise<ResolvedCredentialDefinition> {
    await this.validateNetworkBoundary(input.contract);
    const definition = await this.createOrFindDefinition(input);
    return this.persist(definition.id, input);
  }

  @Transactional()
  private async persist(
    definitionId: string,
    input: RegisterExternalCredentialDefinitionInput
  ): Promise<ResolvedCredentialDefinition> {
    const query = this.definitions
      .createQueryBuilder('definition')
      .where('definition.id = :definitionId', { definitionId });
    if (!['sqlite', 'better-sqlite3'].includes(this.dataSource.options.type)) {
      query.setLock('pessimistic_write');
    }
    const definition = await query.getOne();
    if (!definition) throw new BadRequestException('Credential definition sync state was lost');
    definition.repoOwner = input.repoOwner;
    definition.repoName = input.repoName;

    const compatibilityLine = compatibilityLineForSemver(input.semver);
    const recorded = await this.versions.findOneBy({
      externalDefinitionId: definition.id,
      semver: input.semver,
    });
    if (recorded) {
      if (
        recorded.commitSha !== input.commitSha ||
        recorded.githubReleaseId !== input.githubReleaseId
      ) {
        throw new BadRequestException(
          `Credential definition version ${input.semver} was already recorded from another release`
        );
      }
      this.markSynced(definition, input.semver, new Date());
      await this.definitions.save(definition);
      return this.resolved(definition.id, recorded);
    }

    const current = definition.currentVersionId
      ? await this.versions.findOneBy({ id: definition.currentVersionId })
      : null;
    if (
      current?.compatibilityLine === compatibilityLine &&
      !isCompatibleWithinLine(current.contract, input.contract)
    ) {
      throw new BadRequestException(
        `Credential definition ${input.semver} changes an incompatible contract within compatibility line ${compatibilityLine}; publish a new compatibility line for this change`
      );
    }

    const version = await this.versions.save(
      this.versions.create({
        externalDefinitionId: definition.id,
        semver: input.semver,
        compatibilityLine,
        commitSha: input.commitSha,
        githubReleaseId: input.githubReleaseId,
        tagName: input.tagName,
        contract: input.contract,
      })
    );
    if (!current || compareSemver(input.semver, current.semver) > 0) {
      definition.currentVersionId = version.id;
      definition.currentCompatibilityLine = compatibilityLine;
    }
    this.markSynced(definition, input.semver, new Date());
    await this.definitions.save(definition);
    return this.resolved(definition.id, version);
  }

  private async createOrFindDefinition(
    input: RegisterExternalCredentialDefinitionInput
  ): Promise<CredentialExternalDefinition> {
    const existing = await this.definitions.findOneBy({ githubRepoId: input.githubRepoId });
    if (existing) return existing;
    try {
      return await this.definitions.save(
        this.definitions.create({
          githubRepoId: input.githubRepoId,
          repoOwner: input.repoOwner,
          repoName: input.repoName,
          currentVersionId: null,
          currentCompatibilityLine: null,
          lastSyncSummary: null,
          nextSyncAt: null,
        })
      );
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const winner = await this.definitions.findOneBy({ githubRepoId: input.githubRepoId });
      if (!winner) throw error;
      return winner;
    }
  }

  async getCurrentByGithubRepoId(
    githubRepoId: string
  ): Promise<ResolvedCredentialDefinition | null> {
    const definition = await this.definitions.findOneBy({ githubRepoId });
    if (!definition?.currentVersionId) return null;
    const version = await this.versions.findOneBy({ id: definition.currentVersionId });
    return version ? this.resolved(definition.id, version) : null;
  }

  listDue(now: Date, limit: number): Promise<CredentialExternalDefinition[]> {
    return this.definitions.find({
      where: { nextSyncAt: LessThanOrEqual(now) },
      order: { nextSyncAt: 'ASC' },
      take: limit,
    });
  }

  async reschedule(definitionId: string, now = new Date()): Promise<void> {
    await this.definitions.update(definitionId, {
      nextSyncAt: this.nextSyncAfter(definitionId, now),
    });
  }

  nextSyncAfter(definitionId: string, now: Date): Date {
    const slot = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        this.slotIndexOf(definitionId) * SLOT_MINUTES
      )
    );
    return slot.getTime() > now.getTime() ? slot : new Date(slot.getTime() + DAY_MS);
  }

  private markSynced(definition: CredentialExternalDefinition, semver: string, now: Date): void {
    definition.lastSyncSummary = { syncedAt: now.toISOString(), semver };
    definition.nextSyncAt = this.nextSyncAfter(definition.id, now);
  }

  private slotIndexOf(definitionId: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < definitionId.length; index += 1) {
      hash ^= definitionId.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash % SLOTS_PER_DAY;
  }

  private async validateNetworkBoundary(contract: CredentialDefinitionContract): Promise<void> {
    try {
      for (const origin of contract.origins) {
        const url = await assertPublicHttpUrl(origin, { allowedProtocols: ['https:'] });
        if (url.origin !== new URL(origin).origin) throw new Error('invalid origin');
      }
      if (contract.ai) {
        const baseUrl = await assertPublicHttpUrl(contract.ai.baseUrl, {
          allowedProtocols: ['https:'],
        });
        if (!contract.origins.some(origin => new URL(origin).origin === baseUrl.origin)) {
          throw new Error('AI base URL is outside the declared origins');
        }
      }
    } catch {
      throw new BadRequestException('Credential definition contains a non-public network target');
    }
  }

  private resolved(
    definitionId: string,
    version: CredentialDefinitionVersion
  ): ResolvedCredentialDefinition {
    return {
      definitionId,
      source: 'external',
      compatibilityLine: version.compatibilityLine,
      contract: version.contract,
    };
  }
}

export function compatibilityLineForSemver(semver: string): string {
  const [major, minor] = semver.split('.').map(Number);
  if (!Number.isInteger(major) || !Number.isInteger(minor)) {
    throw new BadRequestException('Credential definition version is not canonical SemVer');
  }
  return major === 0 ? `0.${minor}` : String(major);
}

function isCompatibleWithinLine(
  previous: CredentialDefinitionContract,
  next: CredentialDefinitionContract
): boolean {
  return (
    previous.id === next.id &&
    sameSet(previous.origins, next.origins) &&
    previous.auth.type === next.auth.type &&
    previous.auth.headerName.toLowerCase() === next.auth.headerName.toLowerCase() &&
    (previous.auth.prefix ?? '') === (next.auth.prefix ?? '') &&
    (!previous.ai || Boolean(next.ai)) &&
    (!previous.ai || previous.ai.adapter === next.ai?.adapter) &&
    (!previous.ai || previous.ai.baseUrl === next.ai?.baseUrl)
  );
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every(value => right.includes(value));
}

function compareSemver(left: string, right: string): number {
  const l = left.split('.').map(Number);
  const r = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = (l[index] ?? 0) - (r[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}
