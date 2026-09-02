import { BadRequestException, Injectable } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { BUILTIN_CREDENTIAL_DEFINITION_IDS } from '../../data-marts/credentials/services/builtin-credential-definitions';
import { CredentialExternalDefinitionRegistryService } from '../../data-marts/credentials/services/credential-external-definition-registry.service';
import { parseExternalCredentialManifest } from '../../data-marts/credentials/services/external-credential-manifest';
import {
  normalizeCredentialRequirement,
  type ResolvedExternalCredentialRequirement,
  type StoredCredentialRequirement,
} from '../../data-marts/credentials/credential.types';
import type { ResolvedCredentialDefinition } from '../../data-marts/credentials/dto/credential-api.dto';
import { GithubReadPolicy } from '../enums/github-read-policy.enum';
import type { PluginCredentialRequirement } from '../utils/plugin-manifest.util';
import { parseGithubRepoLocator } from '../utils/github-repo-locator.util';
import { compareSemver, formatSemver, parseReleaseTag } from '../utils/semver.util';
import { GithubApiService } from './github-api.service';

export class ExternalCredentialRequirementError extends BadRequestException {}

@Injectable()
export class ExternalCredentialDefinitionSyncService {
  constructor(
    private readonly github: GithubApiService,
    private readonly registry: CredentialExternalDefinitionRegistryService
  ) {}

  async syncLocator(locator: string): Promise<ResolvedCredentialDefinition> {
    const ref = parseExternalLocator(locator);
    const repo = await this.github.getRepo(ref, GithubReadPolicy.CONFIGURED);
    const releases = (await this.github.listReleases(ref, GithubReadPolicy.CONFIGURED))
      .flatMap(release => {
        if (release.isDraft || release.isPrerelease) return [];
        const parsed = parseReleaseTag(release.tagName);
        return parsed.ok ? [{ release, semver: formatSemver(parsed.parts) }] : [];
      })
      .sort((left, right) => compareSemver(right.semver, left.semver));

    const rejections: string[] = [];
    for (const candidate of releases) {
      const commitSha = await this.github.resolveCommitSha(
        ref,
        candidate.release.tagName,
        GithubReadPolicy.CONFIGURED
      );
      if (!commitSha) {
        rejections.push(`${candidate.semver}: tag does not resolve to a commit`);
        continue;
      }
      const parsed = parseExternalCredentialManifest(
        await this.github.getFileAtCommit(
          ref,
          'plugin.json',
          commitSha,
          GithubReadPolicy.CONFIGURED
        )
      );
      if (!parsed.ok) {
        rejections.push(`${candidate.semver}: ${parsed.detail}`);
        continue;
      }
      try {
        return await this.registry.register({
          githubRepoId: repo.githubRepoId,
          repoOwner: repo.owner,
          repoName: repo.name,
          semver: candidate.semver,
          commitSha,
          githubReleaseId: candidate.release.githubReleaseId,
          tagName: candidate.release.tagName,
          contract: parsed.contract,
        });
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        throw new ExternalCredentialRequirementError(
          `${candidate.semver}: ${castError(error).message}`
        );
      }
    }

    const current = await this.registry.getCurrentByGithubRepoId(repo.githubRepoId);
    if (current) return current;
    throw new ExternalCredentialRequirementError(
      'No eligible Credential definition release was found'
    );
  }

  async resolveRequirements(
    requirements: readonly PluginCredentialRequirement[]
  ): Promise<StoredCredentialRequirement[]> {
    const resolved: StoredCredentialRequirement[] = [];
    for (const requirement of requirements) {
      const locator = typeof requirement === 'string' ? requirement : requirement.id;
      if (!locator.startsWith('@')) {
        if (locator !== 'ai' && !BUILTIN_CREDENTIAL_DEFINITION_IDS.has(locator)) {
          throw new ExternalCredentialRequirementError(
            `Unknown Credential requirement "${locator}"; use ai, a built-in definition, or @owner/repository`
          );
        }
        resolved.push(requirement);
        continue;
      }
      let definition: ResolvedCredentialDefinition;
      try {
        definition = await this.syncLocator(locator);
      } catch (error) {
        if (error instanceof ExternalCredentialRequirementError) throw error;
        if (error instanceof BadRequestException) {
          throw new ExternalCredentialRequirementError(castError(error).message);
        }
        throw error;
      }
      const external: ResolvedExternalCredentialRequirement = {
        id: definition.contract.id,
        definitionId: definition.definitionId,
        optional: typeof requirement === 'string' ? false : requirement.optional,
        models: typeof requirement === 'string' ? undefined : requirement.models,
      };
      resolved.push(external);
    }

    const keys = new Set<string>();
    for (const requirement of resolved) {
      const key = normalizeCredentialRequirement(requirement).key;
      if (keys.has(key)) {
        throw new ExternalCredentialRequirementError(`Duplicate resolved Credential handle ${key}`);
      }
      keys.add(key);
    }
    return resolved;
  }
}

function parseExternalLocator(locator: string) {
  if (!locator.startsWith('@')) {
    throw new BadRequestException('External Credential definition must use @owner/repository');
  }
  return parseGithubRepoLocator(locator.slice(1));
}
