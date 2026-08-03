import { InvalidRepoLocatorError } from '../errors/plugin-host.errors';

export interface GithubRepoRef {
  readonly owner: string;
  readonly name: string;
}

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);
const SEGMENT = /^[A-Za-z0-9._-]+$/;
const SCP_SYNTAX = /^git@([^:]+):(.+)$/;

/**
 * Normalizes the publisher-facing identifier into owner and repository name.
 *
 * This is not the plugin's identity -- that is GitHub's stable numeric repository id,
 * resolved later. Owner and name are mutable management metadata, so casing is kept
 * as typed rather than normalized away.
 *
 * @throws {InvalidRepoLocatorError}
 */
export function parseGithubRepoLocator(locator: string): GithubRepoRef {
  const trimmed = locator?.trim() ?? '';
  if (!trimmed) {
    throw new InvalidRepoLocatorError(locator);
  }

  const scp = SCP_SYNTAX.exec(trimmed);
  if (scp) {
    if (!GITHUB_HOSTS.has(scp[1].toLowerCase())) {
      throw new InvalidRepoLocatorError(locator);
    }
    return toRef(scp[2].split('/'), locator, { allowExtraSegments: false });
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new InvalidRepoLocatorError(locator);
    }
    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) {
      throw new InvalidRepoLocatorError(locator);
    }
    // A repository URL may carry /tree/main, /blob/... and similar suffixes.
    return toRef(url.pathname.split('/').filter(Boolean), locator, { allowExtraSegments: true });
  }

  return toRef(trimmed.split('/'), locator, { allowExtraSegments: false });
}

function toRef(
  rawSegments: string[],
  locator: string,
  options: { allowExtraSegments: boolean }
): GithubRepoRef {
  const segments = rawSegments.filter(Boolean);
  if (segments.length < 2 || (!options.allowExtraSegments && segments.length > 2)) {
    throw new InvalidRepoLocatorError(locator);
  }

  const owner = segments[0];
  const name = segments[1].replace(/\.git$/i, '');

  if (!SEGMENT.test(owner) || !name || !SEGMENT.test(name)) {
    throw new InvalidRepoLocatorError(locator);
  }

  return { owner, name };
}
