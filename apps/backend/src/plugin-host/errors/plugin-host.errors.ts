import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';

/**
 * Base for every plugin host failure.
 *
 * `memberVisible` decides whether the message and errorDetails may reach an ordinary
 * member. Publisher-management operations disclose GitHub access modes, repository
 * paths and validation diagnostics; §16 of the spec keeps all of that out of
 * member-facing responses. Errors flagged false must be replaced at that boundary.
 */
export abstract class PluginHostError extends BusinessViolationException {
  abstract readonly memberVisible: boolean;

  protected constructor(code: string, message: string, errorDetails?: Record<string, unknown>) {
    super(message, errorDetails, code);
  }
}

export class InvalidRepoLocatorError extends PluginHostError {
  readonly memberVisible = false;

  constructor(locator: string) {
    super(
      'INVALID_REPO_LOCATOR',
      'Expected a GitHub repository, for example https://github.com/owner/name or owner/name',
      { locator }
    );
  }
}

/** The repository does not exist, or is private on a deployment with no GitHub App. */
export class GithubRepoNotFoundError extends PluginHostError {
  readonly memberVisible = false;

  constructor(owner: string, name: string) {
    super('GITHUB_REPO_NOT_FOUND', `GitHub repository ${owner}/${name} was not found`, {
      owner,
      name,
    });
  }
}

/**
 * The repository exists but the OWOX Data Marts GitHub App is not installed on it.
 *
 * Carries the actionable installation URL the spec requires: the CLI prints it and
 * asks the publisher to rerun the same command once access is granted.
 */
export class GithubRepoNotAccessibleError extends PluginHostError {
  readonly memberVisible = false;

  constructor(owner: string, name: string, installationUrl: string) {
    super(
      'GITHUB_REPO_NOT_ACCESSIBLE',
      `OWOX Data Marts cannot read ${owner}/${name}. Install the OWOX Data Marts GitHub App on it and run the same command again.`,
      { owner, name, installationUrl }
    );
  }
}

/** GitHub App credentials are present but unusable, e.g. the private key will not sign. */
export class GithubAuthConfigError extends PluginHostError {
  readonly memberVisible = false;

  constructor(missing: string[]) {
    super('GITHUB_AUTH_CONFIG', 'GitHub App authentication is misconfigured', { missing });
  }
}

export class GithubRateLimitedError extends PluginHostError {
  readonly memberVisible = false;

  constructor(retryAt: string, accessMode: string) {
    super('GITHUB_RATE_LIMITED', `GitHub rate limit reached; retry after ${retryAt}`, {
      retryAt,
      accessMode,
    });
  }
}

export class GithubApiError extends PluginHostError {
  readonly memberVisible = false;

  constructor(status: number, path: string) {
    super('GITHUB_API_ERROR', `GitHub returned HTTP ${status}`, { status, path });
  }
}

/**
 * Another synchronization of this plugin ran too recently.
 *
 * Member-visible: any member with an installation may trigger an update, so this is a
 * failure an ordinary member can legitimately hit and must be told about plainly.
 */
export class PluginSyncRateLimitedError extends PluginHostError {
  readonly memberVisible = true;

  constructor(retryAfterSeconds: number) {
    super(
      'PLUGIN_SYNC_RATE_LIMITED',
      `This plugin was checked very recently. Try again in ${retryAfterSeconds} seconds.`,
      { retryAfterSeconds }
    );
  }
}

/**
 * The caller may not manage publications at the requested scope.
 *
 * Member-visible: a member can legitimately attempt a scope they do not hold, and
 * telling them which scope was refused is not a disclosure -- they supplied it.
 */
export class PublicationAuthorizationError extends PluginHostError {
  readonly memberVisible = true;

  constructor(scope: string, reason: string) {
    super('PLUGIN_PUBLICATION_FORBIDDEN', reason, { scope });
  }
}

/**
 * The requested deployment audience is not a legal form.
 *
 * Covers combining selected projects with the wildcard, supplying neither, trying to
 * carve a project out of the wildcard, and converting between the two forms in one
 * command instead of two.
 */
export class AudienceFormConflictError extends PluginHostError {
  readonly memberVisible = true;

  constructor(scope: string, reason: string) {
    super('PLUGIN_AUDIENCE_CONFLICT', reason, { scope });
  }
}

/**
 * The plugin is suspended deployment-wide.
 *
 * Blocks invocation, installation and restoration; uninstalling and updating stay
 * available. Member-visible: the Gallery keeps showing the plugin marked unavailable,
 * so a member is meant to understand why it will not open.
 */
export class PluginSuspendedError extends PluginHostError {
  readonly memberVisible = true;

  constructor(pluginId: string) {
    super('PLUGIN_SUSPENDED', 'This plugin is temporarily unavailable', { pluginId });
  }
}

/**
 * The version shown on the confirmation screen is no longer the current one.
 *
 * Any installed member can move a plugin forward at any moment, so the version a member
 * read about can change between rendering and confirming. Carrying the new one back
 * lets the screen re-render rather than installing something the member never saw.
 */
export class StaleVersionConfirmationError extends PluginHostError {
  readonly memberVisible = true;

  constructor(currentVersionId: string | null, currentSemver: string | null) {
    super(
      'PLUGIN_STALE_VERSION',
      'This plugin was updated while you were reading. Review the new version and confirm again.',
      { currentVersionId, currentSemver }
    );
  }
}

/** Nothing was ever published for this repository at the requested scope. */
export class PluginNotPublishedError extends PluginHostError {
  readonly memberVisible = true;

  constructor(scope: string) {
    super('PLUGIN_NOT_PUBLISHED', 'This plugin has no publication at that level', { scope });
  }
}

/**
 * Sync finished without any eligible Release, so there is nothing installable to list.
 *
 * Publisher-only: ordinary members never publish, and the rejection list is a source
 * diagnostic (§6.2 / §16).
 */
export class NoEligiblePluginVersionError extends PluginHostError {
  readonly memberVisible = false;

  constructor(
    pluginId: string,
    repository: string,
    rejections: ReadonlyArray<{ tagName: string; code: string; detail: string }>
  ) {
    super(
      'PLUGIN_NO_ELIGIBLE_VERSION',
      `No eligible release was found for ${repository}. Fix the repository Releases and publish again.`,
      { pluginId, repository, rejections }
    );
  }
}

/**
 * A version is already recorded for this SemVer against a different Release or commit.
 *
 * Raised only where a caller needs to know; inside synchronization it is collected as a
 * rejection instead, so one re-cut Release cannot abort a whole sync.
 */
export class PluginVersionConflictError extends PluginHostError {
  readonly memberVisible = false;

  constructor(semver: string, recordedCommitSha: string, incomingCommitSha: string) {
    super('PLUGIN_VERSION_CONFLICT', `Version ${semver} is already recorded from another commit`, {
      semver,
      recordedCommitSha,
      incomingCommitSha,
    });
  }
}
