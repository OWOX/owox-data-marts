import { BadRequestException, Injectable } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { BUILTIN_CREDENTIAL_DEFINITION_IDS } from '../../data-marts/credentials/services/builtin-credential-definitions';
import {
  CredentialExternalDefinitionRegistryService,
  type RegisterExternalCredentialDefinitionInput,
} from '../../data-marts/credentials/services/credential-external-definition-registry.service';
import { parseExternalCredentialManifest } from '../../data-marts/credentials/services/external-credential-manifest';
import {
  type CredentialDefinitionContract,
  normalizeCredentialRequirement,
  type ResolvedExternalCredentialRequirement,
  type StoredCredentialRequirement,
} from '../../data-marts/credentials/credential.types';
import type { ResolvedCredentialDefinition } from '../../data-marts/credentials/dto/credential-api.dto';
import { GithubReadPolicy } from '../enums/github-read-policy.enum';
import {
  GithubRepoNotAccessibleError,
  GithubRepoNotFoundError,
  InvalidRepoLocatorError,
} from '../errors/plugin-host.errors';
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

  syncLocator(locator: string): Promise<ResolvedCredentialDefinition> {
    return this.settleLocator(locator, input => this.registry.register(input));
  }

  private async settleLocator<T extends { readonly contract: CredentialDefinitionContract }>(
    locator: string,
    settle: (input: RegisterExternalCredentialDefinitionInput) => Promise<T>
  ): Promise<T | ResolvedCredentialDefinition> {
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
        return await settle({
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
    const settled = await this.settleRequirements(requirements, locator =>
      this.syncLocator(locator)
    );
    return settled.map(({ requirement, definition }): StoredCredentialRequirement => {
      if (!definition) return requirement;
      const external: ResolvedExternalCredentialRequirement = {
        id: definition.contract.id,
        definitionId: definition.definitionId,
        optional: typeof requirement === 'string' ? false : requirement.optional,
        models: typeof requirement === 'string' ? undefined : requirement.models,
      };
      return external;
    });
  }

  /** `resolveRequirements`' rules without writing to the registry; an unreadable Credential repository becomes a requirement error. */
  async previewRequirements(requirements: readonly PluginCredentialRequirement[]): Promise<void> {
    await this.settleRequirements(requirements, async locator => {
      try {
        return await this.settleLocator(locator, input => this.registry.preview(input));
      } catch (error) {
        if (
          error instanceof InvalidRepoLocatorError ||
          error instanceof GithubRepoNotFoundError ||
          error instanceof GithubRepoNotAccessibleError
        ) {
          throw new ExternalCredentialRequirementError(`${locator}: ${error.message}`);
        }
        throw error;
      }
    });
  }

  private async settleRequirements<D extends { readonly contract: CredentialDefinitionContract }>(
    requirements: readonly PluginCredentialRequirement[],
    settle: (locator: string) => Promise<D>
  ): Promise<
    { readonly requirement: PluginCredentialRequirement; readonly definition: D | null }[]
  > {
    const settled: { requirement: PluginCredentialRequirement; definition: D | null }[] = [];
    for (const requirement of requirements) {
      const locator = typeof requirement === 'string' ? requirement : requirement.id;
      if (!locator.startsWith('@')) {
        if (locator !== 'ai' && !BUILTIN_CREDENTIAL_DEFINITION_IDS.has(locator)) {
          throw new ExternalCredentialRequirementError(
            `Unknown Credential requirement "${locator}"; use ai, a built-in definition, or @owner/repository`
          );
        }
        settled.push({ requirement, definition: null });
        continue;
      }
      let definition: D;
      try {
        definition = await settle(locator);
      } catch (error) {
        if (error instanceof ExternalCredentialRequirementError) throw error;
        if (error instanceof BadRequestException) {
          throw new ExternalCredentialRequirementError(castError(error).message);
        }
        throw error;
      }
      settled.push({ requirement, definition });
    }

    const keys = new Set<string>();
    for (const { requirement, definition } of settled) {
      const key = definition
        ? definition.contract.id
        : normalizeCredentialRequirement(requirement).key;
      if (keys.has(key)) {
        throw new ExternalCredentialRequirementError(`Duplicate resolved Credential handle ${key}`);
      }
      keys.add(key);
    }
    return settled;
  }
}

function parseExternalLocator(locator: string) {
  if (!locator.startsWith('@')) {
    throw new BadRequestException('External Credential definition must use @owner/repository');
  }
  return parseGithubRepoLocator(locator.slice(1));
}
