import { Injectable, Optional } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import type { StoredCredentialRequirement } from '../../data-marts/credentials/credential.types';
import { PluginVersion } from '../entities/plugin-version.entity';
import { ReleaseRejectionCode } from '../enums/release-rejection-code.enum';
import { GithubRepoRef } from '../utils/github-repo-locator.util';
import {
  findIncompatibleCollectionChange,
  parsePluginManifest,
  PluginManifest,
} from '../utils/plugin-manifest.util';
import { compareSemver, majorOf, sameCompatibilityLine } from '../utils/semver.util';
import {
  ExternalCredentialDefinitionSyncService,
  ExternalCredentialRequirementError,
} from './external-credential-definition-sync.service';
import { GithubApiService } from './github-api.service';
import { PluginVersionService } from './plugin-version.service';
import { RemoteUrlValidatorService } from './remote-url-validator.service';

export interface ReleaseCandidate {
  readonly pluginId: string;
  readonly ref: GithubRepoRef;
  readonly commitSha: string;
  /** Null: no compatibility line, so no baseline and no collection rule. */
  readonly semver: string | null;
}

export interface ReleaseCandidateIssue {
  readonly code: ReleaseRejectionCode;
  readonly detail: string;
}

type Rejection = { readonly ok: false } & ReleaseCandidateIssue;

export type ReleaseCandidateVerdict =
  | {
      readonly ok: true;
      readonly manifest: PluginManifest;
      readonly credentialRequirements: readonly StoredCredentialRequirement[];
    }
  | Rejection;

export interface ReleaseCandidateReport {
  readonly issues: readonly ReleaseCandidateIssue[];
  readonly manifest: PluginManifest | null;
  readonly credentialRequirements: readonly StoredCredentialRequirement[] | null;
  readonly baselineSemver: string | null;
  readonly collectionsEvaluated: boolean;
}

@Injectable()
export class ReleaseCandidateRulesService {
  constructor(
    private readonly githubApi: GithubApiService,
    private readonly remoteUrlValidator: RemoteUrlValidatorService,
    private readonly versionService: PluginVersionService,
    @Optional()
    private readonly externalCredentialDefinitions?: ExternalCredentialDefinitionSyncService
  ) {}

  async firstFailure(candidate: ReleaseCandidate): Promise<ReleaseCandidateVerdict> {
    const parsed = await this.fetchManifest(candidate);
    if (!parsed.ok) return parsed;
    const { manifest } = parsed;

    const baseline = await this.findBaseline(candidate);
    const collections = baseline && this.checkCollections(baseline, manifest);
    if (collections) return { ok: false, ...collections };

    const delivery = await this.remoteUrlValidator.validate(manifest.delivery.url);
    if (!delivery.ok) return delivery;

    const credentials = await this.resolveCredentialRequirements(manifest);
    if (!credentials.ok) return credentials;

    return { ok: true, manifest, credentialRequirements: credentials.requirements };
  }

  /** An invalid manifest is the only issue; otherwise every rule runs and every failure is listed. */
  async collectAll(candidate: ReleaseCandidate): Promise<ReleaseCandidateReport> {
    const parsed = await this.fetchManifest(candidate);
    const baseline = await this.findBaseline(candidate);
    const baselineSemver = baseline?.semver ?? null;
    if (!parsed.ok) {
      return {
        issues: [{ code: parsed.code, detail: parsed.detail }],
        manifest: null,
        credentialRequirements: null,
        baselineSemver,
        collectionsEvaluated: false,
      };
    }
    const { manifest } = parsed;
    const issues: ReleaseCandidateIssue[] = [];

    const collections = baseline && this.checkCollections(baseline, manifest);
    if (collections) issues.push(collections);

    const delivery = await this.remoteUrlValidator.validate(manifest.delivery.url);
    if (!delivery.ok) issues.push({ code: delivery.code, detail: delivery.detail });

    const credentials = await this.resolveCredentialRequirements(manifest);
    if (!credentials.ok) issues.push({ code: credentials.code, detail: credentials.detail });

    return {
      issues,
      manifest,
      credentialRequirements: credentials.ok ? credentials.requirements : null,
      baselineSemver,
      collectionsEvaluated: baseline !== undefined,
    };
  }

  private async fetchManifest({ ref, commitSha }: ReleaseCandidate) {
    return parsePluginManifest(await this.githubApi.getFileAtCommit(ref, 'plugin.json', commitSha));
  }

  // Only the candidate's own line binds it: opening a new line is a declared breaking change.
  private async findBaseline({
    pluginId,
    semver,
  }: ReleaseCandidate): Promise<PluginVersion | undefined> {
    if (semver === null) return undefined;
    return (await this.versionService.findAllByPluginId(pluginId))
      .filter(version => sameCompatibilityLine(version.semver, semver))
      .reduce<
        PluginVersion | undefined
      >((highest, version) => (!highest || compareSemver(version.semver, highest.semver) > 0 ? version : highest), undefined);
  }

  private checkCollections(
    baseline: PluginVersion,
    manifest: PluginManifest
  ): ReleaseCandidateIssue | null {
    const incompatibility = findIncompatibleCollectionChange(
      baseline.collections ?? [],
      manifest.collections
    );
    if (!incompatibility) return null;

    // The baseline shares the candidate's line, so it shares its major too.
    const escape =
      majorOf(baseline.semver) === 0
        ? 'bump the minor version to ship this breaking change while below 1.0.0'
        : 'publish a new major version to ship this breaking change';
    return {
      code: ReleaseRejectionCode.COLLECTIONS_INCOMPATIBLE,
      detail: `${incompatibility} within the ${baseline.semver} compatibility line; ${escape}`,
    };
  }

  private async resolveCredentialRequirements(
    manifest: PluginManifest
  ): Promise<
    { readonly ok: true; readonly requirements: readonly StoredCredentialRequirement[] } | Rejection
  > {
    if (!manifest.credentials.some(externalLocator)) {
      return { ok: true, requirements: manifest.credentials };
    }
    if (!this.externalCredentialDefinitions) {
      throw new Error('External Credential definitions are not available');
    }
    try {
      return {
        ok: true,
        requirements: await this.externalCredentialDefinitions.resolveRequirements(
          manifest.credentials
        ),
      };
    } catch (error) {
      if (!(error instanceof ExternalCredentialRequirementError)) throw error;
      return {
        ok: false,
        code: ReleaseRejectionCode.MANIFEST_SCHEMA,
        detail: castError(error).message,
      };
    }
  }
}

function externalLocator(requirement: string | { id: string }): boolean {
  return (typeof requirement === 'string' ? requirement : requirement.id).startsWith('@');
}
